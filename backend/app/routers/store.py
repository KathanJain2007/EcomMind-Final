"""Products, demo data, mandate, wallet, agent status and service-agent calls."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..deps import current_business, current_user, idempotency_key
from ..errors import ApiError
from ..models import AgentCall, Business, Mandate, Product, ServiceAgent, User, WalletTxn
from ..security import new_id, sign
from ..seed import load_demo_business
from ..services import agent_calls, intelligence
from ..services.ledger import budget_consumed_today, get_mandate, log_activity, wallet_balance, wallet_spent_today

router = APIRouter(prefix="/api", tags=["store"])


# --------------------------------------------------------------------------- products

def product_out(p: Product) -> dict:
    return {"sku": p.sku, "name": p.name, "category": p.category, "price": p.price, "cost": p.cost, "stock": p.stock,
            "avgDailySales": p.avg_daily_sales, "returnRate": p.return_rate, "icon": p.icon, "paused": p.paused,
            "coverageDays": intelligence.coverage_days(p), "status": intelligence.stock_status(p),
            "marginPct": round((p.price - p.cost) / p.price * 100, 1) if p.price else None}


class ProductIn(BaseModel):
    sku: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    price: int = Field(gt=0, description="paise")
    cost: int = Field(ge=0, description="paise")
    stock: int = Field(ge=0)
    avgDailySales: float = Field(gt=0)
    icon: str = Field(default="package", max_length=40)


@router.get("/products")
def list_products(q: str | None = None, category: str | None = None, status: str | None = None,
                  biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(select(Product).where(Product.business_id == biz.id).order_by(Product.id)).all()
    out = [product_out(p) for p in rows]
    if q:
        ql = q.strip().lower()
        out = [p for p in out if ql in p["name"].lower() or ql in p["sku"].lower()]
    if category and category != "All":
        out = [p for p in out if p["category"] == category]
    if status and status != "All":
        out = [p for p in out if p["status"] == status]
    return {"products": out}


@router.post("/products", status_code=201)
def add_product(body: ProductIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    if body.cost >= body.price:
        raise ApiError(422, "invalid_cost", "Unit cost must be below the selling price.", field="cost")
    sku = body.sku.upper()
    if db.scalar(select(Product.id).where(Product.business_id == biz.id, func.upper(Product.sku) == sku)):
        raise ApiError(409, "sku_taken", "A product with this SKU already exists.", field="sku")
    p = Product(business_id=biz.id, sku=sku, name=body.name.strip(), category=body.category, price=body.price,
                cost=body.cost, stock=body.stock, avg_daily_sales=body.avgDailySales, icon=body.icon)
    db.add(p)
    log_activity(db, biz.id, agent="Seller", action=f"Product added manually: {p.name}", product=p.name, status="success",
                 detail=f"SKU {sku} · {p.stock} units @ ₹{p.price / 100:,.0f}")
    db.commit()
    return product_out(p)


@router.post("/demo/load")
def demo_load(user: User = Depends(current_user), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    load_demo_business(db, biz, user)
    return {"loaded": True}


# --------------------------------------------------------------------------- agent status + mandate

class AgentStatusIn(BaseModel):
    status: str = Field(pattern=r"^(active|paused)$")


@router.put("/agent/status")
def set_agent_status(body: AgentStatusIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    biz.agent_status = body.status
    log_activity(db, biz.id, agent="Seller", action="EcomMind paused" if body.status == "paused" else "EcomMind resumed",
                 status="warning" if body.status == "paused" else "success")
    db.commit()
    return {"status": biz.agent_status}


def mandate_out(m: Mandate) -> dict:
    return {"dailyBudget": m.daily_budget, "maxOrderValue": m.max_order_value, "maxPerCallCost": m.max_per_call_cost,
            "walletDailyLimit": m.wallet_daily_limit, "maxPriceChangePct": m.max_price_change_pct,
            "minGrossMarginPct": m.min_gross_margin_pct, "autoPauseReturnPct": m.auto_pause_return_pct,
            "autoPurchasing": m.auto_purchasing, "autoNegotiation": m.auto_negotiation, "autoRepricing": m.auto_repricing,
            "approvalAboveLimit": m.approval_above_limit, "agentsPaused": m.agents_paused}


class MandateIn(BaseModel):
    dailyBudget: int = Field(ge=0, le=10**12)
    maxOrderValue: int = Field(ge=0, le=10**12)
    maxPerCallCost: int = Field(ge=0, le=10**9)
    walletDailyLimit: int = Field(ge=0, le=10**10)
    maxPriceChangePct: float = Field(ge=0, le=100)
    minGrossMarginPct: float = Field(ge=0, lt=100)
    autoPauseReturnPct: float = Field(ge=0, le=100)
    autoPurchasing: bool
    autoNegotiation: bool
    autoRepricing: bool
    approvalAboveLimit: bool
    agentsPaused: bool


@router.get("/mandate")
def get_mandate_ep(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    m = get_mandate(db, biz.id)
    db.commit()
    return {"mandate": mandate_out(m), "today": {"consumed": budget_consumed_today(db, biz.id)}}


@router.put("/mandate")
def put_mandate(body: MandateIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    m = get_mandate(db, biz.id)
    m.daily_budget, m.max_order_value, m.max_per_call_cost = body.dailyBudget, body.maxOrderValue, body.maxPerCallCost
    m.wallet_daily_limit, m.max_price_change_pct = body.walletDailyLimit, body.maxPriceChangePct
    m.min_gross_margin_pct, m.auto_pause_return_pct = body.minGrossMarginPct, body.autoPauseReturnPct
    m.auto_purchasing, m.auto_negotiation, m.auto_repricing = body.autoPurchasing, body.autoNegotiation, body.autoRepricing
    m.approval_above_limit, m.agents_paused = body.approvalAboveLimit, body.agentsPaused
    m.updated_at = datetime.now(timezone.utc)
    if body.agentsPaused:
        biz.agent_status = "paused"
    log_activity(db, biz.id, agent="Seller", action="Mandate updated", status="info")
    db.commit()
    return {"mandate": mandate_out(m)}


# --------------------------------------------------------------------------- wallet

def txn_out(t: WalletTxn) -> dict:
    return {"id": t.id, "time": t.time.isoformat(), "counterparty": t.counterparty, "kind": t.kind, "amount": t.amount,
            "status": t.status, "signature": t.signature, "memo": t.memo, "ref": t.ref}


@router.get("/wallet")
def wallet(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    m = get_mandate(db, biz.id)
    db.commit()
    return {"balance": wallet_balance(db, biz.id), "spentToday": wallet_spent_today(db, biz.id),
            "dailyLimit": m.wallet_daily_limit, "budgetConsumedToday": budget_consumed_today(db, biz.id),
            "dailyBudget": m.daily_budget}


class TopUpIn(BaseModel):
    amount: int = Field(gt=0, le=1_000_000_00)


@router.post("/wallet/topups", status_code=201)
def top_up(body: TopUpIn, key: str = Depends(idempotency_key), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    existing = db.scalar(select(WalletTxn).where(WalletTxn.business_id == biz.id, WalletTxn.idempotency_key == key, WalletTxn.kind == "topup"))
    if existing:
        return {"txn": txn_out(existing), "balance": wallet_balance(db, biz.id), "replayed": True}
    tid = new_id("TXN")
    t = WalletTxn(id=tid, business_id=biz.id, counterparty="Wallet top-up (simulated)", kind="topup", amount=body.amount,
                  status="Completed", signature=sign(tid, body.amount), memo="UPI top-up · demo funds", idempotency_key=key)
    db.add(t)
    log_activity(db, biz.id, agent="Seller", action="Wallet topped up (simulated)", amount=body.amount, status="success", ref=tid)
    db.commit()
    return {"txn": txn_out(t), "balance": wallet_balance(db, biz.id), "replayed": False}


# --------------------------------------------------------------------------- service agents

@router.get("/service-agents")
def service_agents(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"agents": [agent_calls.agent_out(a) for a in db.scalars(select(ServiceAgent).order_by(ServiceAgent.id)).all()]}


class CallIn(BaseModel):
    sku: str = Field(min_length=1, max_length=40)


@router.post("/service-agents/{agent_id}/calls")
def call_agent(agent_id: str, body: CallIn, key: str = Depends(idempotency_key),
               user: User = Depends(current_user), biz: Business = Depends(current_business)):
    return agent_calls.call_agent(SessionLocal, user, biz, agent_id, body.sku.upper(), key)


@router.get("/service-agents/calls/{call_id}")
def get_call(call_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    c = db.get(AgentCall, call_id)
    if not c or c.business_id != biz.id:
        raise ApiError(404, "not_found", "Call not found.")
    return agent_calls.call_out(c, db.get(ServiceAgent, c.agent_id).name)


@router.get("/products/{sku}/intelligence")
def product_intelligence(sku: str, days: int = Query(default=14, ge=7, le=60), biz: Business = Depends(current_business),
                         db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.business_id == biz.id, Product.sku == sku.upper()))
    if not p:
        raise ApiError(404, "product_not_found", "Product not found.")
    m = get_mandate(db, biz.id)
    db.commit()
    return {"product": product_out(p), "forecast": intelligence.forecast(db, p, days),
            "pricing": intelligence.price_suggestion(db, p, m)}
