"""Escrow: list, inspect and move funds held for agreed deals."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business
from ..errors import ApiError
from ..models import Business, Escrow, WalletTxn
from ..services import escrow as svc

router = APIRouter(prefix="/api/escrows", tags=["escrow"])

STATUSES = ("pending", "locked", "dispatched", "delivered", "released", "refunded", "cancelled")


def _detail(db: Session, e: Escrow) -> dict:
    txns = db.scalars(select(WalletTxn).where(WalletTxn.business_id == e.business_id, WalletTxn.ref == e.id)
                      .order_by(WalletTxn.time)).all()
    return svc.out(e, list(txns))


@router.get("")
def list_escrows(status: Optional[str] = Query(default=None), biz: Business = Depends(current_business),
                 db: Session = Depends(get_db)):
    stmt = select(Escrow).where(Escrow.business_id == biz.id)
    if status:
        wanted = [s for s in status.split(",") if s]
        bad = [s for s in wanted if s not in STATUSES]
        if bad:
            raise ApiError(422, "invalid_status", f"Unknown escrow status: {', '.join(bad)}.", field="status")
        stmt = stmt.where(Escrow.status.in_(wanted))
    rows = db.scalars(stmt.order_by(Escrow.created_at.desc())).all()
    return {"escrows": [svc.out(e) for e in rows]}


@router.get("/summary")
def summary(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.execute(select(Escrow.status, func.count(), func.coalesce(func.sum(Escrow.amount), 0))
                      .where(Escrow.business_id == biz.id).group_by(Escrow.status)).all()
    by = {s: {"count": 0, "amount": 0} for s in STATUSES}
    for s, c, a in rows:
        by[s] = {"count": int(c), "amount": int(a)}
    held = sum(by[s]["amount"] for s in svc.ACTIVE)
    return {"byStatus": by, "held": held, "heldCount": sum(by[s]["count"] for s in svc.ACTIVE),
            "awaitingFunds": by["pending"]["amount"], "released": by["released"]["amount"],
            "refunded": by["refunded"]["amount"], "total": sum(v["count"] for v in by.values())}


@router.get("/{escrow_id}")
def get_escrow(escrow_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    return _detail(db, svc.get_owned(db, biz.id, escrow_id))


@router.post("/{escrow_id}/lock")
def lock(escrow_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    e = svc.get_owned(db, biz.id, escrow_id)
    svc.lock(db, e)
    db.commit()
    return _detail(db, e)


class DispatchIn(BaseModel):
    courier: Optional[str] = Field(default=None, max_length=80)
    trackingId: Optional[str] = Field(default=None, max_length=80)


@router.post("/{escrow_id}/dispatch")
def dispatch(escrow_id: str, body: DispatchIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    e = svc.get_owned(db, biz.id, escrow_id)
    svc.dispatch(db, e, (body.courier or "").strip() or None, (body.trackingId or "").strip() or None)
    db.commit()
    return _detail(db, e)


@router.post("/{escrow_id}/confirm-delivery")
def confirm_delivery(escrow_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    e = svc.get_owned(db, biz.id, escrow_id)
    svc.confirm_delivery(db, e)
    db.commit()
    return _detail(db, e)


@router.post("/{escrow_id}/release")
def release(escrow_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    e = svc.get_owned(db, biz.id, escrow_id)
    svc.release(db, e)
    db.commit()
    return _detail(db, e)


class RefundIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/{escrow_id}/refund")
def refund(escrow_id: str, body: RefundIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    e = svc.get_owned(db, biz.id, escrow_id)
    svc.refund(db, e, body.reason.strip())
    db.commit()
    return _detail(db, e)


@router.post("/{escrow_id}/cancel")
def cancel(escrow_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    e = svc.get_owned(db, biz.id, escrow_id)
    svc.cancel(db, e)
    db.commit()
    return _detail(db, e)
