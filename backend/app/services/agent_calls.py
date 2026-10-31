"""Paid service-agent calls.

One logical call = one AgentCall row keyed by (user, Idempotency-Key).

  1. Reserve (transaction 1): replay a finished call with the same key, refuse
     a duplicate in-flight call, check the mandate and wallet, then write a
     `pending` row.
  2. Execute the agent outside any transaction, with a timeout.
  3. Settle (transaction 2, BEGIN IMMEDIATE): re-check the balance, write the
     wallet debit, increment the agent's counter with an atomic
     `calls_served = calls_served + 1`, and mark the call `success` — all or
     nothing. Failures, rejections and timeouts never charge or count.
"""
from __future__ import annotations

import concurrent.futures
from collections.abc import Callable
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from ..config import settings
from ..errors import ApiError
from ..models import AgentCall, Business, Product, ServiceAgent, User, WalletTxn
from ..security import new_id, sign
from . import intelligence
from .ledger import budget_consumed_today, get_mandate, log_activity, wallet_balance, wallet_spent_today

_pool = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="agent")


# --------------------------------------------------------------------------- executors

def _exec_forecast(db: Session, biz: Business, product: Product) -> dict:
    f = intelligence.forecast(db, product)
    return {"kind": "demand_forecast", "demand7": f["demand7"], "demand30": f["demand30"],
            "reorderQty": f["reorderQty"], "confidencePct": f["confidencePct"]}


def _exec_price(db: Session, biz: Business, product: Product) -> dict:
    s = intelligence.price_suggestion(db, product, get_mandate(db, biz.id))
    return {"kind": "market_price", **s, "currentPrice": product.price}


def _exec_return(db: Session, biz: Business, product: Product) -> dict:
    r = intelligence.return_risk(db, biz.id, product.sku)
    return {"kind": "return_risk", "productReturnRate": product.return_rate, "pincodes": r["pincodes"], "threshold": r["threshold"]}


def _exec_logistics(db: Session, biz: Business, product: Product) -> dict:
    r = intelligence.logistics_ranking(db, biz.id)
    return {"kind": "logistics_quote", "quotes": r["quotes"][:3], "recommended": r["recommended"]}


EXECUTORS: dict[str, Callable[[Session, Business, Product], dict]] = {
    "demand_forecast": _exec_forecast,
    "market_price": _exec_price,
    "return_risk": _exec_return,
    "logistics_quote": _exec_logistics,
}


# --------------------------------------------------------------------------- serialisers

def agent_out(a: ServiceAgent) -> dict:
    return {"id": a.id, "name": a.name, "type": a.type, "operation": a.operation, "pricePerCall": a.price_per_call,
            "unit": a.unit, "rating": a.rating, "callsServed": a.calls_served, "availability": a.availability,
            "latency": a.latency, "capabilities": a.capabilities, "description": a.description, "icon": a.icon}


def call_out(c: AgentCall, agent_name: str | None = None) -> dict:
    return {"id": c.id, "agentId": c.agent_id, "agentName": agent_name, "userId": c.user_id, "operation": c.operation,
            "sku": c.sku, "productName": c.product_name, "status": c.status, "cost": c.cost,
            "chargedAmount": c.cost if c.status == "success" else 0,
            "errorCode": c.error_code, "errorMessage": c.error_message, "txnId": c.txn_id,
            "createdAt": c.created_at.isoformat() if c.created_at else None,
            "completedAt": c.completed_at.isoformat() if c.completed_at else None}


def _response(db: Session, call: AgentCall, agent: ServiceAgent, replayed: bool) -> dict:
    txn = db.get(WalletTxn, call.txn_id) if call.txn_id else None
    return {
        "call": call_out(call, agent.name),
        "agent": agent_out(agent),
        "result": call.result,
        "receipt": {"txnId": txn.id, "amount": -txn.amount, "signature": txn.signature, "timestamp": txn.time.isoformat()} if txn else None,
        "wallet": {"balance": wallet_balance(db, call.business_id)},
        "replayed": replayed,
    }


# --------------------------------------------------------------------------- flow

def _reject(db: Session, call: AgentCall, code: str, message: str, status_code: int) -> None:
    call.status = "rejected"
    call.error_code, call.error_message = code, message
    call.completed_at = datetime.now(timezone.utc)
    db.commit()
    raise ApiError(status_code, code, message, details={"callId": call.id})


def call_agent(SessionFactory: sessionmaker, user: User, business: Business, agent_id: str, sku: str, key: str) -> dict:
    # ---- 1. reserve
    with SessionFactory() as db:
        agent = db.get(ServiceAgent, agent_id)
        if not agent:
            raise ApiError(404, "agent_not_found", "That service agent doesn't exist.")
        product = db.scalar(select(Product).where(Product.business_id == business.id, Product.sku == sku))
        if not product:
            raise ApiError(404, "product_not_found", f"No product with SKU {sku} in your catalogue.", field="sku")

        existing = db.scalar(select(AgentCall).where(AgentCall.user_id == user.id, AgentCall.idempotency_key == key))
        if existing:
            if existing.agent_id != agent_id or existing.sku != sku:
                raise ApiError(422, "idempotency_key_reused", "This Idempotency-Key was already used for a different call.")
            if existing.status == "success":
                return _response(db, existing, agent, replayed=True)
            if existing.status == "pending":
                raise ApiError(409, "call_in_progress", "This call is already running.", details={"callId": existing.id})
            call = existing  # failed / rejected / timed out: the same logical request may be retried
            call.status, call.error_code, call.error_message, call.completed_at = "pending", None, None, None
            call.cost = agent.price_per_call
            call.created_at = datetime.now(timezone.utc)
        else:
            call = AgentCall(id=new_id("CALL"), agent_id=agent_id, user_id=user.id, business_id=business.id,
                             operation=agent.operation, sku=sku, product_name=product.name, status="pending",
                             cost=agent.price_per_call, idempotency_key=key)
            db.add(call)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise ApiError(409, "call_in_progress", "This call is already running.")

        mandate = get_mandate(db, business.id)
        biz = db.get(Business, business.id)
        if mandate.agents_paused or biz.agent_status == "paused":
            _reject(db, call, "agents_paused", "All agents are paused. Resume EcomMind to place calls.", 403)
        if agent.availability != "Online":
            _reject(db, call, "agent_unavailable", f"{agent.name} is {agent.availability.lower()} right now.", 503)
        if agent.price_per_call > mandate.max_per_call_cost:
            _reject(db, call, "mandate_per_call_limit",
                    f"Blocked by mandate: ₹{agent.price_per_call / 100:g}/call exceeds your ₹{mandate.max_per_call_cost / 100:g} per-call limit.", 403)
        if wallet_spent_today(db, business.id) + agent.price_per_call > mandate.wallet_daily_limit:
            _reject(db, call, "wallet_daily_limit", "This call would exceed your daily wallet spending limit.", 403)
        if budget_consumed_today(db, business.id) + agent.price_per_call > mandate.daily_budget:
            _reject(db, call, "mandate_daily_budget", "This call would exceed today's mandate budget.", 403)
        if wallet_balance(db, business.id) < agent.price_per_call:
            _reject(db, call, "insufficient_balance", "Insufficient wallet balance. Top up your micro-payment wallet.", 402)
        db.commit()
        call_id = call.id

    # ---- 2. execute
    def run() -> dict:
        with SessionFactory() as xdb:
            return EXECUTORS[agent.operation](xdb, db_business(xdb, business.id), db_product(xdb, business.id, sku))

    status, result, err = "success", None, None
    try:
        result = _pool.submit(run).result(timeout=settings.agent_timeout_seconds)
    except concurrent.futures.TimeoutError:
        status, err = "timed_out", ("agent_timeout", f"{agent.name} didn't respond in time. You were not charged.")
    except Exception:  # noqa: BLE001 - any executor failure is a failed call, never a charge
        status, err = "failed", ("agent_failed", f"{agent.name} couldn't complete the request. You were not charged.")

    # ---- 3. settle
    with SessionFactory() as db:
        call = db.get(AgentCall, call_id)
        agent = db.get(ServiceAgent, agent_id)
        now = datetime.now(timezone.utc)
        if status != "success":
            call.status, call.error_code, call.error_message, call.completed_at = status, err[0], err[1], now
            log_activity(db, business.id, agent=agent.name, action="Agent call failed", product=call.product_name,
                         status="warning", detail=err[1], ref=call.id)
            db.commit()
            raise ApiError(504 if status == "timed_out" else 502, err[0], err[1], details={"callId": call.id})

        if wallet_balance(db, business.id) < call.cost:  # balance moved since reservation
            _reject(db, call, "insufficient_balance", "Insufficient wallet balance. Top up your micro-payment wallet.", 402)

        txn_id = new_id("TXN")
        db.add(WalletTxn(id=txn_id, business_id=business.id, time=now, counterparty=agent.name, kind="service_call",
                         amount=-call.cost, status="Completed", signature=sign(txn_id, call.id, -call.cost, now.isoformat()),
                         memo=f"1 call · {call.product_name} ({call.sku})", ref=call.id, idempotency_key=key))
        db.execute(update(ServiceAgent).where(ServiceAgent.id == agent_id).values(calls_served=ServiceAgent.calls_served + 1))
        call.status, call.result, call.txn_id, call.completed_at = "success", result, txn_id, now
        log_activity(db, business.id, agent=agent.name, action=f"Purchased 1 {agent.unit.replace('per ', '')}",
                     product=call.product_name, amount=call.cost, status="success",
                     detail=f"Receipt {txn_id} · call {call.id}", ref=call.id)
        db.commit()
        db.refresh(agent)
        return _response(db, call, agent, replayed=False)


def db_business(db: Session, business_id: int) -> Business:
    return db.get(Business, business_id)


def db_product(db: Session, business_id: int, sku: str) -> Product:
    p = db.scalar(select(Product).where(Product.business_id == business_id, Product.sku == sku))
    if not p:
        raise LookupError(sku)
    return p
