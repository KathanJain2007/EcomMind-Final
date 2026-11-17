"""The EcomMind agent's own check-up pass over a business.

It runs once a day from Vercel Cron (``GET /api/cron/agent-runs``) and whenever
the seller presses "Run check now". Each pass:

* restocks products that are Critical, Low Stock or Out of Stock, using the
  demand forecast for the quantity and the cheapest valid supplier quote;
* reprices products whose competitor-based price suggestion differs from the
  current price by at least 1%, unless pricing is set to manual.

What it may do on its own follows the seller's mandate, exactly as the manual
flows do:

* Level 1 (advisory): records recommendations only. Nothing is queued or sent.
* Level 2 (approval-based): puts each action in the approval queue.
* Level 3 (restricted autonomous): sends RFQs (when automatic purchasing is on),
  accepts offers inside the order and daily limits, and applies price changes
  that pass every pricing safeguard. Anything outside the limits still goes to
  the approval queue.

A paused agent, or a mandate with all agents paused, skips the pass. A
proposal the seller rejected is not proposed again for REJECT_COOLDOWN.
Every step runs in its own savepoint, so one product's failure doesn't undo
the rest of the pass.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import (
    AgentRun, Approval, Business, CompetitorPrice, Escrow, Negotiation, Product, Supplier, SupplierQuote, User,
)
from ..security import new_id
from . import approvals, intelligence, negotiation, pricing
from .ledger import get_mandate, log_activity

log = logging.getLogger(__name__)

AGENT_NAME = "EcomMind"
REJECT_COOLDOWN = timedelta(days=7)
# The cron call is daily; this stops a retried or doubled call from running a business twice.
SCHEDULE_MIN_GAP = timedelta(hours=20)
MIN_PRICE_MOVE_PCT = 1.0
RESTOCK_STATUSES = ("Critical", "Low Stock", "Out of Stock")
OPEN_NEGOTIATION = ("quotation_requested", "awaiting_supplier_response", "negotiation_in_progress", "offer_received")
INCOMING_ESCROW = ("pending", "locked", "dispatched")


def inr(paise: int) -> str:
    return pricing.inr(paise)


def run_out(r: AgentRun) -> dict:
    iso = lambda d: d.isoformat() if d else None  # noqa: E731
    return {"id": r.id, "trigger": r.trigger, "status": r.status, "summary": r.summary, "actions": r.actions or [],
            "startedAt": iso(r.started_at), "finishedAt": iso(r.finished_at)}


# --------------------------------------------------------------------------- helpers

def _recently_rejected(db: Session, business_id: int, dedupe_key: str) -> bool:
    since = datetime.now(timezone.utc) - REJECT_COOLDOWN
    return db.scalar(select(Approval.id).where(Approval.business_id == business_id, Approval.dedupe_key == dedupe_key,
                                               Approval.status == "rejected", Approval.decided_at >= since).limit(1)) is not None


def _pending(db: Session, business_id: int, dedupe_key: str) -> Optional[Approval]:
    return db.scalar(select(Approval).where(Approval.business_id == business_id, Approval.dedupe_key == dedupe_key,
                                            Approval.status == "pending"))


def _restock_in_progress(db: Session, business_id: int, sku: str) -> Optional[str]:
    """An open negotiation or incoming escrow for this SKU, so another restock would double-order."""
    neg = db.scalar(select(Negotiation.id).where(Negotiation.business_id == business_id, Negotiation.sku == sku,
                                                 Negotiation.status.in_(OPEN_NEGOTIATION)).limit(1))
    if neg:
        return neg
    return db.scalar(select(Escrow.id).where(Escrow.business_id == business_id, Escrow.sku == sku,
                                             Escrow.status.in_(INCOMING_ESCROW)).limit(1))


def _best_quote(db: Session, business_id: int, sku: str, wanted: int) -> Optional[tuple[SupplierQuote, int]]:
    """Cheapest quote that is still valid and can supply at least its minimum order; returns (quote, quantity)."""
    quotes = db.scalars(select(SupplierQuote).join(Supplier, Supplier.id == SupplierQuote.supplier_id).where(
        SupplierQuote.sku == sku, SupplierQuote.valid_till >= date.today(), SupplierQuote.available > 0,
        or_(SupplierQuote.business_id.is_(None), SupplierQuote.business_id == business_id),
        or_(Supplier.business_id.is_(None), Supplier.business_id == business_id),
    ).order_by(SupplierQuote.unit_price, SupplierQuote.delivery_days)).all()
    for q in quotes:
        qty = min(max(wanted, q.moq), q.available)
        if qty >= q.moq:
            return q, qty
    return None


class _Run:
    def __init__(self, db: Session, biz: Business, run: AgentRun):
        self.db, self.biz, self.run = db, biz, run
        self.actions: list[dict] = []

    def add(self, kind: str, product: Product, outcome: str, detail: str, ref: Optional[str] = None) -> None:
        self.actions.append({"kind": kind, "sku": product.sku, "productName": product.name, "outcome": outcome,
                             "detail": detail[:300], "ref": ref})

    def step(self, kind: str, product: Product, fn: Callable[[], None]) -> None:
        try:
            with self.db.begin_nested():
                fn()
        except ApiError as e:
            self.add(kind, product, "blocked", e.message)
        except Exception:  # noqa: BLE001 - one product must not stop the pass
            log.exception("agent run %s: %s step failed for %s", self.run.id, kind, product.sku)
            self.add(kind, product, "error", "Something went wrong on this step. It will be retried on the next run.")


# --------------------------------------------------------------------------- steps

def _restock(r: _Run, p: Product, level: int) -> None:
    db, biz = r.db, r.biz
    m = get_mandate(db, biz.id)
    status = intelligence.stock_status(p)
    busy = _restock_in_progress(db, biz.id, p.sku)
    if busy:
        r.add("restock", p, "skipped", f"{status}: a restock is already under way ({busy}).", busy)
        return
    f = intelligence.forecast(db, p)
    if f["reorderQty"] <= 0:
        return
    found = _best_quote(db, biz.id, p.sku, f["reorderQty"])
    if not found:
        r.add("restock", p, "skipped", f"{status}: no valid supplier quote covers this product. Import or request quotes.")
        return
    q, qty = found
    supplier = db.get(Supplier, q.supplier_id)
    sname = supplier.name.split("—")[0].strip()
    total = q.unit_price * qty
    target = round(q.unit_price * 0.95) if m.auto_negotiation else None
    why = (f"{p.stock} units left (~{intelligence.coverage_days(p)} days of cover); forecast {f['demand30']} units "
           f"over 30 days. Best quote: {sname} at {inr(q.unit_price)}/unit, {q.delivery_days}-day delivery.")
    key = f"restock:{p.sku}"
    location = biz.location_text or "Seller warehouse"

    if level <= 1:
        log_activity(db, biz.id, agent=AGENT_NAME, action=f"Recommends restocking {qty} × {p.name}", product=p.name,
                     status="info", amount=total, detail=why)
        r.add("restock", p, "recommended", f"Order {qty} units from {sname} for about {inr(total)}. {why}")
        return
    if _recently_rejected(db, biz.id, key):
        r.add("restock", p, "skipped", "You declined this restock in the last 7 days.")
        return
    existing = _pending(db, biz.id, key)
    if existing:
        r.add("restock", p, "waiting", "A restock for this product is already waiting for your approval.", existing.id)
        return

    if level >= 3 and m.auto_purchasing:
        user = db.get(User, biz.owner_id)
        _, neg, _ = negotiation.create_rfq(db, biz.id, user.id, supplier_id=q.supplier_id, sku=p.sku, quantity=qty,
                                           target_unit_price=target, delivery_location=location,
                                           delivery_days=q.delivery_days, idempotency_key=f"agent-{r.run.id}-{p.sku}"[:80],
                                           requested_by=AGENT_NAME)
        if neg.status != "offer_received":
            r.add("restock", p, "rfq_sent", f"Requested {qty} units from {sname}; waiting for the supplier.", neg.id)
            return
        result, obj = negotiation.request_accept(db, neg, user.id, agent_name=AGENT_NAME)
        deal = f"{qty} units from {sname} at {inr(neg.latest_supplier_price or q.unit_price)}/unit"
        if result == "accepted":
            r.add("restock", p, "purchased", f"Agreed {deal}. Escrow {obj.id}: {obj.status}.", neg.id)
        else:
            r.add("restock", p, "queued", f"Offer for {deal} is above your limits and is waiting for approval.", obj.id)
        return

    a = approvals.queue(db, biz.id, action_type="restock", agent_name=AGENT_NAME,
                        title=f"Restock {qty} × {p.name} from {sname} (~{inr(total)})", description=why,
                        reasons=["autonomy_level" if level < 3 else "auto_purchasing_off"], financial_impact=-total,
                        payload={"supplierId": q.supplier_id, "sku": p.sku, "quantity": qty, "targetUnitPrice": target,
                                 "deliveryLocation": location, "deliveryDays": q.delivery_days},
                        dedupe_key=key)
    r.add("restock", p, "queued", f"Sent for your approval: order {qty} units from {sname} for about {inr(total)}.", a.id)


def _reprice(r: _Run, p: Product, level: int) -> None:
    db, biz = r.db, r.biz
    m = get_mandate(db, biz.id)
    s = intelligence.price_suggestion(db, p, m)
    new = s.get("suggestedPrice")
    if not new or not p.price or abs(new - p.price) / p.price * 100 < MIN_PRICE_MOVE_PCT:
        return
    move = f"{inr(p.price)} → {inr(new)}"
    reason = f"Cheapest competitor is {inr(s['lowestCompetitor'])}; margin at the new price {s['marginAtSuggestedPct']}%."
    if level <= 1:
        log_activity(db, biz.id, agent=AGENT_NAME, action=f"Recommends repricing {p.name}: {move}", product=p.name,
                     status="info", detail=reason)
        r.add("price", p, "recommended", f"Reprice {move}. {reason}")
        return
    key = f"price:{p.sku}:{new}"
    if _recently_rejected(db, biz.id, key):
        r.add("price", p, "skipped", f"You declined {move} in the last 7 days.")
        return
    if _pending(db, biz.id, key):
        r.add("price", p, "waiting", f"{move} is already waiting for your approval.")
        return
    result, obj = pricing.request_change(db, biz.id, p.sku, new, reason=reason, source="agent", actor=AGENT_NAME,
                                         user_id=None, expected_price=p.price)
    if result == "applied":
        r.add("price", p, "applied", f"Repriced {move}. {reason}", obj.id)
    else:
        r.add("price", p, "queued", f"Sent for your approval: {move}.", obj.id)


# --------------------------------------------------------------------------- one business

def _summary(actions: list[dict]) -> str:
    def count(kind: str, *outcomes: str) -> int:
        return sum(1 for a in actions if a["kind"] == kind and a["outcome"] in outcomes)

    parts = []
    for n, label in [
        (count("restock", "purchased"), "restock deal(s) agreed"),
        (count("restock", "rfq_sent"), "RFQ(s) sent"),
        (count("price", "applied"), "price change(s) applied"),
        (count("restock", "queued") + count("price", "queued"), "action(s) sent for approval"),
        (count("restock", "recommended") + count("price", "recommended"), "recommendation(s)"),
        (count("restock", "blocked", "error") + count("price", "blocked", "error"), "step(s) blocked"),
    ]:
        if n:
            parts.append(f"{n} {label}")
    if parts:
        return ", ".join(parts)
    waiting = count("restock", "waiting") + count("price", "waiting")
    if waiting:
        return f"Nothing new. {waiting} earlier proposal(s) still waiting for your approval."
    return "Everything is in order. No action needed."


def run_for_business(db: Session, biz: Business, trigger: str) -> AgentRun:
    """Run one pass and return the stored AgentRun. The caller commits."""
    run = AgentRun(id=new_id("RUN"), business_id=biz.id, trigger=trigger, status="completed", summary="", actions=[])
    db.add(run)
    db.flush()
    m = get_mandate(db, biz.id)
    skip = None
    if biz.agent_status == "paused":
        skip = "EcomMind is paused. Start it on the Overview page to resume checks."
    elif m.agents_paused:
        skip = "All agents are paused in your mandate."
    if skip:
        run.status, run.summary, run.finished_at = "skipped", skip, datetime.now(timezone.utc)
        return run

    r = _Run(db, biz, run)
    level = m.autonomy_level
    products = db.scalars(select(Product).where(Product.business_id == biz.id, Product.paused.is_(False))
                          .order_by(Product.id)).all()
    priced = set(db.scalars(select(CompetitorPrice.sku).where(CompetitorPrice.business_id == biz.id)).all())
    for p in products:
        if intelligence.stock_status(p) in RESTOCK_STATUSES:
            r.step("restock", p, lambda p=p: _restock(r, p, level))
    if m.pricing_mode != "manual":
        for p in products:
            if p.sku in priced:
                r.step("price", p, lambda p=p: _reprice(r, p, level))

    run.actions = r.actions
    run.summary = _summary(r.actions)[:500]
    run.finished_at = datetime.now(timezone.utc)
    label = "Scheduled check" if trigger == "schedule" else "Check run"
    log_activity(db, biz.id, agent=AGENT_NAME, action=f"{label}: {run.summary}"[:200],
                 status="warning" if any(a["outcome"] in ("blocked", "error") for a in r.actions) else "success",
                 detail=f"{approvals.AUTONOMY_LABELS.get(level, f'Level {level}')} · {len(products)} products checked",
                 ref=run.id)
    return run


# --------------------------------------------------------------------------- every business (cron)

def run_scheduled(session_factory, deadline_seconds: float = 50.0) -> dict:
    """Run the daily pass for every eligible business, each in its own transaction.

    Only businesses with products are checked, and demo accounts are left out. Businesses run least-recently-checked first, so
    if the deadline cuts a run short, the ones left out go first next time."""
    started = time.monotonic()
    with session_factory() as db:
        try:
            answered = negotiation.answer_waiting_negotiations(db)
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            log.exception("cron: answering waiting negotiations failed")
            answered = 0
        cutoff = datetime.now(timezone.utc) - SCHEDULE_MIN_GAP
        candidates = db.execute(
            select(Business.id).join(User, User.id == Business.owner_id)
            .where(User.is_demo.is_(False), select(Product.id).where(Product.business_id == Business.id).exists())
            .order_by(Business.id)
        ).scalars().all()
        last = dict(db.execute(select(AgentRun.business_id, AgentRun.started_at)
                               .where(AgentRun.trigger == "schedule").order_by(AgentRun.started_at)).all())
        db.commit()

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    due = [b for b in candidates if last.get(b, epoch) < cutoff]
    due.sort(key=lambda b: last.get(b, epoch))
    counts = {"completed": 0, "skipped": 0, "failed": 0}
    for i, biz_id in enumerate(due):
        if time.monotonic() - started > deadline_seconds:
            return {**counts, "deferred": len(due) - i, "negotiationsAnswered": answered}
        with session_factory() as db:
            try:
                biz = db.get(Business, biz_id)
                run = run_for_business(db, biz, "schedule")
                db.commit()
                counts[run.status] += 1
            except Exception as e:  # noqa: BLE001
                db.rollback()
                log.exception("cron: agent run failed for business %s", biz_id)
                db.add(AgentRun(id=new_id("RUN"), business_id=biz_id, trigger="schedule", status="failed",
                                summary=f"The check stopped with an error: {type(e).__name__}."[:500], actions=[],
                                finished_at=datetime.now(timezone.utc)))
                db.commit()
                counts["failed"] += 1
    return {**counts, "deferred": 0, "negotiationsAnswered": answered}
