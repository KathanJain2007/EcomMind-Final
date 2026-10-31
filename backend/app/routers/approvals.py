"""Approval queue: list, approve (executes the action once) and reject."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business, current_user
from ..errors import ApiError
from ..models import Approval, Business, User
from ..services import approvals as svc

router = APIRouter(prefix="/api/approvals", tags=["approvals"])
STATUSES = ("pending", "approved", "rejected")


@router.get("")
def list_approvals(status: Optional[str] = None, limit: int = Query(default=100, ge=1, le=500),
                   biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    stmt = select(Approval).where(Approval.business_id == biz.id)
    if status:
        if status not in STATUSES:
            raise ApiError(422, "invalid_status", "Unknown approval status.", field="status")
        stmt = stmt.where(Approval.status == status)
    rows = db.scalars(stmt.order_by(Approval.created_at.desc()).limit(limit)).all()
    pending = db.scalar(select(func.count()).select_from(Approval).where(Approval.business_id == biz.id,
                                                                          Approval.status == "pending")) or 0
    # pending first, newest first within each group
    rows = sorted(rows, key=lambda a: (a.status != "pending",))
    return {"approvals": [svc.out(a) for a in rows], "pendingCount": int(pending)}


@router.get("/{approval_id}")
def get_approval(approval_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    return svc.out(svc.get_owned(db, biz.id, approval_id))


@router.post("/{approval_id}/approve")
def approve(approval_id: str, user: User = Depends(current_user), biz: Business = Depends(current_business),
            db: Session = Depends(get_db)):
    a = svc.get_owned(db, biz.id, approval_id)
    try:
        svc.approve(db, a, user)
        db.commit()
    except ApiError as e:
        db.rollback()  # nothing from the failed execution is kept; the request stays pending
        svc.record_failure(db, approval_id, e.message)
        db.commit()
        raise
    return svc.out(a)


class RejectIn(BaseModel):
    reason: str = Field(default="Declined by the seller", min_length=3, max_length=300)


@router.post("/{approval_id}/reject")
def reject(approval_id: str, body: RejectIn, user: User = Depends(current_user), biz: Business = Depends(current_business),
           db: Session = Depends(get_db)):
    a = svc.get_owned(db, biz.id, approval_id)
    svc.reject(db, a, user, body.reason.strip())
    db.commit()
    return svc.out(a)
