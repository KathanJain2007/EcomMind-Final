"""Approval queue: actions that need the seller's decision.

Actions land here when they exceed the seller's mandate (and the mandate says
"ask me above the limit"), or when an agent proposes them at an autonomy level
that doesn't let it act alone. Approving moves the item from pending to
approved with a compare-and-set UPDATE and executes the action in the same
transaction, so an action runs exactly once: a second click, a second tab or a
retry finds it already approved. If execution fails, the transaction rolls
back and the item stays pending with the error recorded.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import Approval, Escrow, Negotiation, User
from ..security import new_id
from .ledger import log_activity

ACTION_TYPES = ("price_change", "bulk_price_change", "purchase", "restock", "escrow_lock")
AUTONOMY_LABELS = {1: "Level 1 · Advisory", 2: "Level 2 · Approval-based", 3: "Level 3 · Restricted autonomous"}


def inr(paise: int) -> str:
    r = paise / 100
    return f"₹{r:,.0f}" if r == int(r) else f"₹{r:,.2f}"


def out(a: Approval) -> dict:
    iso = lambda d: d.isoformat() if d else None  # noqa: E731
    return {"id": a.id, "actionType": a.action_type, "title": a.title, "description": a.description, "agentName": a.agent_name,
            "payload": a.payload, "reasons": a.reasons, "financialImpact": a.financial_impact, "status": a.status,
            "createdAt": iso(a.created_at), "decidedAt": iso(a.decided_at), "decidedBy": a.decided_by_name,
            "rejectionReason": a.rejection_reason, "executedAt": iso(a.executed_at), "result": a.result,
            "lastError": a.last_error}


def queue(db: Session, business_id: int, *, action_type: str, title: str, description: str, agent_name: str,
          payload: dict, reasons: list[str], financial_impact: int = 0, dedupe_key: Optional[str] = None) -> Approval:
    """Add a pending approval, or return the identical one that is already pending."""
    assert action_type in ACTION_TYPES
    if dedupe_key:
        existing = db.scalar(select(Approval).where(Approval.business_id == business_id, Approval.dedupe_key == dedupe_key,
                                                    Approval.status == "pending"))
        if existing:
            return existing
    a = Approval(id=new_id("APR"), business_id=business_id, action_type=action_type, title=title[:200],
                 description=description[:1000], agent_name=agent_name[:80], payload=payload, reasons=reasons,
                 financial_impact=financial_impact, status="pending", dedupe_key=dedupe_key)
    db.add(a)
    db.flush()
    log_activity(db, business_id, agent=agent_name[:80], action=f"Sent for your approval: {title}"[:200], status="warning",
                 amount=abs(financial_impact) or None, detail=description[:2000], ref=a.id)
    return a


def get_owned(db: Session, business_id: int, approval_id: str) -> Approval:
    a = db.get(Approval, approval_id)
    if not a or a.business_id != business_id:
        raise ApiError(404, "approval_not_found", "Approval not found.")
    return a


def _execute(db: Session, a: Approval, user: User) -> dict:
    p = a.payload
    actor = f"Seller · {user.name}"[:80]
    if a.action_type == "price_change":
        from . import pricing
        pc = pricing.change_price(db, a.business_id, p["sku"], int(p["newPrice"]), reason=p.get("reason") or a.title,
                                  source="approval", actor=actor, user_id=user.id, approved=True,
                                  expected_price=p.get("expectedPrice"), ref=a.id)
        return {"priceChangeId": pc.id, "sku": pc.sku, "newPrice": pc.new_price}
    if a.action_type == "bulk_price_change":
        from . import pricing
        ids = []
        for c in p["changes"]:
            pc = pricing.change_price(db, a.business_id, c["sku"], int(c["newPrice"]), reason=p.get("reason") or a.title,
                                      source="approval", actor=actor, user_id=user.id, approved=True,
                                      expected_price=c.get("expectedPrice"), ref=p.get("ref") or a.id)
            ids.append(pc.id)
        return {"priceChangeIds": ids}
    if a.action_type == "purchase":
        from . import negotiation
        neg = db.get(Negotiation, p["negotiationId"])
        if not neg or neg.business_id != a.business_id:
            raise ApiError(404, "negotiation_not_found", "The negotiation for this purchase no longer exists.")
        esc = negotiation.accept_offer(db, neg, user.id, approved=True)
        return {"negotiationId": neg.id, "escrowId": esc.id, "escrowStatus": esc.status}
    if a.action_type == "restock":
        from . import negotiation
        rfq, neg, _ = negotiation.create_rfq(db, a.business_id, user.id, supplier_id=p["supplierId"], sku=p["sku"],
                                             quantity=int(p["quantity"]), target_unit_price=p.get("targetUnitPrice"),
                                             delivery_location=p.get("deliveryLocation") or "Seller warehouse",
                                             delivery_days=int(p.get("deliveryDays") or 7), idempotency_key=f"approval-{a.id}",
                                             requested_by=a.agent_name)
        return {"rfqId": rfq.id, "negotiationId": neg.id, "negotiationStatus": neg.status}
    if a.action_type == "escrow_lock":
        from . import escrow
        e = db.get(Escrow, p["escrowId"])
        if not e or e.business_id != a.business_id:
            raise ApiError(404, "escrow_not_found", "The escrow for this approval no longer exists.")
        escrow.lock(db, e, approved=True)
        return {"escrowId": e.id, "escrowStatus": e.status}
    raise ApiError(422, "unknown_action", "Unknown action type.")


def approve(db: Session, a: Approval, user: User) -> Approval:
    if a.status == "approved":
        return a  # already executed once
    if a.status != "pending":
        raise ApiError(409, "approval_closed", f"This request was already {a.status}.")
    now = datetime.now(timezone.utc)
    res = db.execute(update(Approval).where(Approval.id == a.id, Approval.status == "pending")
                     .values(status="approved", decided_at=now, decided_by_user_id=user.id, decided_by_name=user.name[:120]))
    if res.rowcount != 1:
        db.refresh(a)
        if a.status == "approved":
            return a
        raise ApiError(409, "approval_closed", f"This request was already {a.status}.")
    db.refresh(a)
    result = _execute(db, a, user)
    a.result, a.executed_at, a.last_error = result, datetime.now(timezone.utc), None
    log_activity(db, a.business_id, agent=f"Seller · {user.name}"[:80], action=f"Approved: {a.title}"[:200], status="success",
                 detail=f"Executed {a.action_type.replace('_', ' ')} · {a.id}", ref=a.id)
    return a


def record_failure(db: Session, approval_id: str, message: str) -> None:
    db.execute(update(Approval).where(Approval.id == approval_id, Approval.status == "pending").values(last_error=message[:500]))


def reject(db: Session, a: Approval, user: User, reason: str) -> Approval:
    if a.status == "rejected":
        return a
    if a.status != "pending":
        raise ApiError(409, "approval_closed", f"This request was already {a.status}.")
    now = datetime.now(timezone.utc)
    res = db.execute(update(Approval).where(Approval.id == a.id, Approval.status == "pending")
                     .values(status="rejected", decided_at=now, decided_by_user_id=user.id, decided_by_name=user.name[:120],
                             rejection_reason=reason[:300]))
    if res.rowcount != 1:
        db.refresh(a)
        raise ApiError(409, "approval_closed", f"This request was already {a.status}.")
    db.refresh(a)
    if a.action_type == "escrow_lock":
        e = db.get(Escrow, a.payload.get("escrowId"))
        if e and e.status == "pending":
            e.status_note = "You declined locking funds for this escrow. Lock it from the Escrow page when ready."
    log_activity(db, a.business_id, agent=f"Seller · {user.name}"[:80], action=f"Declined: {a.title}"[:200], status="info",
                 detail=reason[:2000], ref=a.id)
    return a


def agent_may_act_alone(autonomy_level: int) -> bool:
    return autonomy_level >= 3
