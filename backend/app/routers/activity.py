"""Agent Activity (with the former Reports): overview, execution history,
transactions, event log, business reports and CSV exports. All lists are
filtered, sorted and paginated on the server."""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business
from ..errors import ApiError
from ..models import RFQ, ActivityEvent, AgentCall, Business, Negotiation, Product, SalesDaily, ServiceAgent, WalletTxn
from ..services import intelligence

router = APIRouter(prefix="/api/activity", tags=["activity"])
IST = timezone(timedelta(hours=5, minutes=30))
FAILED = ("failed", "rejected", "timed_out")


class Page:
    def __init__(self, page: int = Query(default=1, ge=1), pageSize: int = Query(default=25, ge=1, le=200)):
        self.page, self.size = page, pageSize


class Range:
    def __init__(self, dateFrom: date | None = Query(default=None, alias="from"), dateTo: date | None = Query(default=None, alias="to"),
                 days: int | None = Query(default=None, ge=1, le=365)):
        if days and not dateFrom:
            dateFrom = datetime.now(IST).date() - timedelta(days=days - 1)
        self.start = datetime.combine(dateFrom, time(0), IST).astimezone(timezone.utc) if dateFrom else None
        self.end = datetime.combine(dateTo + timedelta(days=1), time(0), IST).astimezone(timezone.utc) if dateTo else None

    def apply(self, q: Select, col) -> Select:
        if self.start:
            q = q.where(col >= self.start)
        if self.end:
            q = q.where(col < self.end)
        return q


def _paginate(db: Session, q: Select, page: Page) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    rows = db.execute(q.offset((page.page - 1) * page.size).limit(page.size)).all()
    return rows, total


def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _csv(filename: str, headers: list[str], rows: list[list]) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def rupees(paise: int | None) -> str:
    return "" if paise is None else f"{paise / 100:.2f}"


# --------------------------------------------------------------------------- overview

@router.get("/overview")
def overview(rng: Range = Depends(), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    base = rng.apply(select(AgentCall).where(AgentCall.business_id == biz.id), AgentCall.created_at).subquery()
    total = db.scalar(select(func.count()).select_from(base)) or 0
    ok = db.scalar(select(func.count()).select_from(base).where(base.c.status == "success")) or 0
    failed = db.scalar(select(func.count()).select_from(base).where(base.c.status.in_(FAILED))) or 0
    spend_q = rng.apply(select(func.coalesce(func.sum(WalletTxn.amount), 0)).where(
        WalletTxn.business_id == biz.id, WalletTxn.kind == "service_call"), WalletTxn.time)
    by_agent = db.execute(
        rng.apply(select(ServiceAgent.name, func.count(AgentCall.id), func.coalesce(func.sum(AgentCall.cost), 0))
                  .join(ServiceAgent, ServiceAgent.id == AgentCall.agent_id)
                  .where(AgentCall.business_id == biz.id, AgentCall.status == "success"), AgentCall.created_at)
        .group_by(ServiceAgent.name).order_by(ServiceAgent.name)).all()
    recent = db.scalars(select(ActivityEvent).where(ActivityEvent.business_id == biz.id).order_by(ActivityEvent.time.desc()).limit(8)).all()
    return {
        "totalCalls": total, "successfulCalls": ok, "failedCalls": failed, "pendingCalls": total - ok - failed,
        "totalSpend": -int(db.scalar(spend_q) or 0),
        "byAgent": [{"agent": n, "calls": c, "spend": s} for n, c, s in by_agent],
        "recent": [event_out(e) for e in recent],
    }


# --------------------------------------------------------------------------- execution history

EXEC_SORT = {"time": AgentCall.created_at, "cost": AgentCall.cost, "agent": ServiceAgent.name, "status": AgentCall.status}


def _exec_query(biz: Business, rng: Range, agent: str | None, status: str | None, q: str | None, sort: str, order: str) -> Select:
    stmt = select(AgentCall, ServiceAgent.name).join(ServiceAgent, ServiceAgent.id == AgentCall.agent_id).where(AgentCall.business_id == biz.id)
    stmt = rng.apply(stmt, AgentCall.created_at)
    if agent and agent != "All":
        stmt = stmt.where(AgentCall.agent_id == agent)
    if status and status != "All":
        stmt = stmt.where(AgentCall.status.in_(FAILED) if status == "failed_any" else AgentCall.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(AgentCall.id.ilike(like), AgentCall.product_name.ilike(like), AgentCall.sku.ilike(like),
                              ServiceAgent.name.ilike(like), AgentCall.operation.ilike(like)))
    col = EXEC_SORT.get(sort, AgentCall.created_at)
    return stmt.order_by(col.asc() if order == "asc" else col.desc(), AgentCall.id)


def exec_out(c: AgentCall, name: str) -> dict:
    return {"id": c.id, "agentId": c.agent_id, "agentName": name, "userId": c.user_id, "operation": c.operation, "sku": c.sku,
            "productName": c.product_name, "status": c.status, "cost": c.cost, "charged": c.cost if c.status == "success" else 0,
            "errorMessage": c.error_message, "txnId": c.txn_id, "createdAt": _iso(c.created_at), "completedAt": _iso(c.completed_at)}


@router.get("/executions")
def executions(page: Page = Depends(), rng: Range = Depends(), agent: str | None = None, status: str | None = None, q: str | None = None,
               sort: str = "time", order: str = Query(default="desc", pattern="^(asc|desc)$"),
               biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows, total = _paginate(db, _exec_query(biz, rng, agent, status, q, sort, order), page)
    return {"items": [exec_out(c, n) for c, n in rows], "total": total, "page": page.page, "pageSize": page.size}


@router.get("/executions.csv")
def executions_csv(rng: Range = Depends(), agent: str | None = None, status: str | None = None, q: str | None = None,
                   sort: str = "time", order: str = "desc", biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.execute(_exec_query(biz, rng, agent, status, q, sort, order).limit(50_000)).all()
    return _csv("ecommind_agent_executions.csv",
                ["Call ID", "Time", "Agent", "Operation", "SKU", "Product", "Status", "Cost (INR)", "Charged (INR)", "Transaction"],
                [[c.id, _iso(c.created_at), n, c.operation, c.sku or "", c.product_name or "", c.status, rupees(c.cost),
                  rupees(c.cost if c.status == "success" else 0), c.txn_id or ""] for c, n in rows])


# --------------------------------------------------------------------------- transactions

TXN_SORT = {"time": WalletTxn.time, "amount": WalletTxn.amount, "counterparty": WalletTxn.counterparty, "kind": WalletTxn.kind}


def _txn_query(biz: Business, rng: Range, kind: str | None, status: str | None, q: str | None, sort: str, order: str) -> Select:
    stmt = rng.apply(select(WalletTxn).where(WalletTxn.business_id == biz.id), WalletTxn.time)
    if kind and kind != "All":
        stmt = stmt.where(WalletTxn.kind.like("escrow%") if kind == "escrow" else WalletTxn.kind == kind)
    if status and status != "All":
        stmt = stmt.where(WalletTxn.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(WalletTxn.id.ilike(like), WalletTxn.counterparty.ilike(like), WalletTxn.memo.ilike(like)))
    col = TXN_SORT.get(sort, WalletTxn.time)
    return stmt.order_by(col.asc() if order == "asc" else col.desc(), WalletTxn.id)


def txn_out(t: WalletTxn) -> dict:
    return {"id": t.id, "time": _iso(t.time), "counterparty": t.counterparty, "kind": t.kind, "amount": t.amount,
            "status": t.status, "signature": t.signature, "memo": t.memo, "ref": t.ref}


@router.get("/transactions")
def transactions(page: Page = Depends(), rng: Range = Depends(), kind: str | None = None, status: str | None = None, q: str | None = None,
                 sort: str = "time", order: str = Query(default="desc", pattern="^(asc|desc)$"),
                 biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows, total = _paginate(db, _txn_query(biz, rng, kind, status, q, sort, order), page)
    return {"items": [txn_out(r[0]) for r in rows], "total": total, "page": page.page, "pageSize": page.size}


@router.get("/transactions.csv")
def transactions_csv(rng: Range = Depends(), kind: str | None = None, status: str | None = None, q: str | None = None,
                     sort: str = "time", order: str = "desc", biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(_txn_query(biz, rng, kind, status, q, sort, order).limit(50_000)).all()
    return _csv("ecommind_transactions.csv", ["Transaction", "Time", "Counterparty", "Type", "Amount (INR)", "Status", "Memo", "Signature"],
                [[t.id, _iso(t.time), t.counterparty, t.kind, rupees(t.amount), t.status, t.memo, t.signature] for t in rows])


# --------------------------------------------------------------------------- activity log

def event_out(e: ActivityEvent) -> dict:
    return {"id": e.id, "time": _iso(e.time), "agent": e.agent, "action": e.action, "product": e.product, "amount": e.amount,
            "status": e.status, "detail": e.detail, "ref": e.ref}


def _event_query(biz: Business, rng: Range, agent: str | None, status: str | None, q: str | None, order: str) -> Select:
    stmt = rng.apply(select(ActivityEvent).where(ActivityEvent.business_id == biz.id), ActivityEvent.time)
    if agent and agent != "All":
        stmt = stmt.where(ActivityEvent.agent == agent)
    if status and status != "All":
        stmt = stmt.where(ActivityEvent.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(ActivityEvent.action.ilike(like), ActivityEvent.agent.ilike(like),
                              ActivityEvent.product.ilike(like), ActivityEvent.detail.ilike(like)))
    return stmt.order_by(ActivityEvent.time.asc() if order == "asc" else ActivityEvent.time.desc(), ActivityEvent.id.desc())


@router.get("/events")
def events(page: Page = Depends(), rng: Range = Depends(), agent: str | None = None, status: str | None = None, q: str | None = None,
           order: str = Query(default="desc", pattern="^(asc|desc)$"), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows, total = _paginate(db, _event_query(biz, rng, agent, status, q, order), page)
    agents = db.scalars(select(ActivityEvent.agent).where(ActivityEvent.business_id == biz.id).distinct().order_by(ActivityEvent.agent)).all()
    return {"items": [event_out(r[0]) for r in rows], "total": total, "page": page.page, "pageSize": page.size, "agents": agents}


class EventIn(BaseModel):
    agent: str = Field(min_length=1, max_length=80)
    action: str = Field(min_length=1, max_length=200)
    status: str = Field(pattern=r"^(success|info|warning|pending)$")
    product: str | None = Field(default=None, max_length=160)
    amount: int | None = Field(default=None, ge=-10**12, le=10**12, description="paise")
    detail: str | None = Field(default=None, max_length=2000)


@router.post("/events", status_code=201)
def add_event(body: EventIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    """Record an event from a browser-side feature (marketplace sync, repricing,
    approvals) so it appears in the same audit log as backend actions."""
    e = ActivityEvent(business_id=biz.id, agent=body.agent.strip(), action=body.action.strip(), status=body.status,
                      product=body.product, amount=body.amount, detail=body.detail)
    db.add(e)
    db.commit()
    return event_out(e)


@router.get("/events.csv")
def events_csv(rng: Range = Depends(), agent: str | None = None, status: str | None = None, q: str | None = None,
               biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(_event_query(biz, rng, agent, status, q, "desc").limit(50_000)).all()
    return _csv("ecommind_agent_activity.csv", ["Time", "Agent", "Action", "Product", "Amount (INR)", "Status", "Detail"],
                [[_iso(e.time), e.agent, e.action, e.product or "", rupees(e.amount), e.status, e.detail or ""] for e in rows])


# --------------------------------------------------------------------------- business reports (formerly /reports)

REPORTS = {
    "sales": "Sales Performance Report",
    "inventory": "Inventory Report",
    "agent-usage": "Agent Usage & Spending Report",
    "negotiations": "Supplier Negotiation Report",
}


@router.get("/reports")
def reports(days: int = Query(default=30, ge=1, le=365), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    """Report catalogue with row counts and the summary strip shown on the Business Reports tab."""
    counts = {}
    for key in REPORTS:
        counts[key] = len(_report_rows(key, days, biz, db)[1])
    since = datetime.now(IST).date() - timedelta(days=days - 1)
    revenue = db.scalar(select(func.coalesce(func.sum(SalesDaily.revenue), 0)).where(SalesDaily.business_id == biz.id, SalesDaily.day >= since)) or 0
    spend = db.scalar(select(func.coalesce(func.sum(WalletTxn.amount), 0)).where(
        WalletTxn.business_id == biz.id, WalletTxn.kind == "service_call",
        WalletTxn.time >= datetime.combine(since, time(0), IST).astimezone(timezone.utc))) or 0
    risk = intelligence.return_risk(db, biz.id)
    return {"days": days, "reports": [{"id": k, "title": v, "rows": counts[k]} for k, v in REPORTS.items()],
            "snapshot": {"revenue": int(revenue), "agentSpend": -int(spend), "highRiskPincodes": len(risk["highRisk"])}}


def _report_rows(key: str, days: int, biz: Business, db: Session) -> tuple[list[str], list[list]]:
    since = datetime.now(IST).date() - timedelta(days=days - 1)
    products = {p.sku: p for p in db.scalars(select(Product).where(Product.business_id == biz.id)).all()}
    if key == "sales":
        rows = db.scalars(select(SalesDaily).where(SalesDaily.business_id == biz.id, SalesDaily.day >= since)
                          .order_by(SalesDaily.day, SalesDaily.sku)).all()
        return (["Date", "SKU", "Product", "Units", "Orders", "Revenue (INR)"],
                [[r.day.isoformat(), r.sku, products[r.sku].name if r.sku in products else r.sku, r.units, r.orders, rupees(r.revenue)] for r in rows])
    if key == "inventory":
        return (["SKU", "Product", "Category", "Price (INR)", "Cost (INR)", "Stock", "Avg daily sales", "Coverage (days)", "Status"],
                [[p.sku, p.name, p.category, rupees(p.price), rupees(p.cost), p.stock, p.avg_daily_sales,
                  intelligence.coverage_days(p) or "", intelligence.stock_status(p)] for p in products.values()])
    if key == "agent-usage":
        start = datetime.combine(since, time(0), IST).astimezone(timezone.utc)
        rows = db.execute(select(ServiceAgent.name, AgentCall.status, func.count(AgentCall.id),
                                 func.coalesce(func.sum(AgentCall.cost), 0))
                          .join(ServiceAgent, ServiceAgent.id == AgentCall.agent_id)
                          .where(AgentCall.business_id == biz.id, AgentCall.created_at >= start)
                          .group_by(ServiceAgent.name, AgentCall.status).order_by(ServiceAgent.name)).all()
        agg: dict[str, list[int]] = {}
        for name, status, n, cost in rows:
            a = agg.setdefault(name, [0, 0, 0])
            if status == "success":
                a[0] += n
                a[2] += cost
            elif status in FAILED:
                a[1] += n
        return (["Agent", "Successful calls", "Failed/rejected calls", "Spend (INR)"],
                [[n, a[0], a[1], rupees(a[2])] for n, a in agg.items()])
    if key == "negotiations":
        rows = db.execute(select(Negotiation, RFQ).join(RFQ, RFQ.id == Negotiation.rfq_id)
                          .where(Negotiation.business_id == biz.id).order_by(Negotiation.created_at.desc())).all()
        return (["Negotiation", "RFQ", "Supplier", "SKU", "Quantity", "Target (INR)", "Latest offer (INR)", "Agreed (INR)", "Status", "Created"],
                [[n.id, r.id, r.supplier_name, n.sku, n.quantity, rupees(r.target_unit_price), rupees(n.latest_supplier_price),
                  rupees(n.agreed_unit_price), n.status, _iso(n.created_at)] for n, r in rows])
    raise ApiError(404, "report_not_found", "Unknown report.")


@router.get("/reports/{key}.csv")
def report_csv(key: str, days: int = Query(default=30, ge=1, le=365), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    headers, rows = _report_rows(key, days, biz, db)
    return _csv(f"ecommind_{key}_report.csv", headers, rows)
