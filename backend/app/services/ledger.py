"""Wallet ledger, activity log and mandate helpers shared by several routers."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import ActivityEvent, Mandate, WalletTxn

IST = timezone(timedelta(hours=5, minutes=30))


def start_of_today_utc() -> datetime:
    """Budgets reset at midnight India time."""
    now = datetime.now(IST)
    return datetime.combine(now.date(), time(0, 0), IST).astimezone(timezone.utc)


def wallet_balance(db: Session, business_id: int) -> int:
    """Balance is derived from the ledger, never stored, so it can't drift."""
    return int(db.scalar(select(func.coalesce(func.sum(WalletTxn.amount), 0)).where(WalletTxn.business_id == business_id)) or 0)


def wallet_spent_today(db: Session, business_id: int) -> int:
    debit = select(func.coalesce(func.sum(WalletTxn.amount), 0)).where(
        WalletTxn.business_id == business_id, WalletTxn.amount < 0, WalletTxn.time >= start_of_today_utc(),
        WalletTxn.kind.in_(["service_call", "logistics"]),
    )
    return -int(db.scalar(debit) or 0)


def budget_consumed_today(db: Session, business_id: int) -> int:
    """Everything counted against the daily mandate: agent calls, logistics, escrow locks."""
    debit = select(func.coalesce(func.sum(WalletTxn.amount), 0)).where(
        WalletTxn.business_id == business_id, WalletTxn.amount < 0, WalletTxn.time >= start_of_today_utc(),
    )
    return -int(db.scalar(debit) or 0)


def get_mandate(db: Session, business_id: int) -> Mandate:
    m = db.get(Mandate, business_id)
    if not m:
        m = Mandate(business_id=business_id)
        db.add(m)
        db.flush()
    return m


def log_activity(db: Session, business_id: int, *, agent: str, action: str, status: str, product: str | None = None,
                 amount: int | None = None, detail: str | None = None, ref: str | None = None) -> ActivityEvent:
    ev = ActivityEvent(business_id=business_id, agent=agent, action=action, status=status, product=product,
                       amount=amount, detail=detail, ref=ref)
    db.add(ev)
    return ev
