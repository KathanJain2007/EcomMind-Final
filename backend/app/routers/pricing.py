"""Price changes and price history."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business, current_user
from ..errors import ApiError
from fastapi.responses import JSONResponse

from ..models import Business, PriceChange, Product, User
from ..services import approvals
from ..services import pricing as svc
from ..services.ledger import get_mandate

router = APIRouter(prefix="/api", tags=["pricing"])


class PriceChangeIn(BaseModel):
    newPrice: int = Field(gt=0, le=10**12, description="paise")
    reason: str = Field(min_length=3, max_length=300)
    source: Literal["seller", "agent", "festival"] = "seller"
    actor: Optional[str] = Field(default=None, max_length=80)
    expectedPrice: Optional[int] = Field(default=None, gt=0)


def _actor(body_actor: Optional[str], source: str, user: User) -> str:
    if source == "seller":
        return f"Seller · {user.name}"[:80]
    return (body_actor or ("Festival Intelligence Agent" if source == "festival" else "Market Price Agent")).strip()[:80]


@router.post("/products/{sku}/price")
def change_price(sku: str, body: PriceChangeIn, user: User = Depends(current_user), biz: Business = Depends(current_business),
                 db: Session = Depends(get_db)):
    result, obj = svc.request_change(db, biz.id, sku, body.newPrice, reason=body.reason.strip(), source=body.source,
                                     actor=_actor(body.actor, body.source, user), user_id=user.id,
                                     expected_price=body.expectedPrice)
    db.commit()
    if result == "queued":
        return JSONResponse(status_code=202, content={"change": None, "approval": approvals.out(obj)})
    return {"change": svc.out(obj), "approval": None}


class BulkItem(BaseModel):
    sku: str = Field(min_length=1, max_length=40)
    newPrice: int = Field(gt=0, le=10**12)
    expectedPrice: Optional[int] = Field(default=None, gt=0)


class BulkIn(BaseModel):
    changes: list[BulkItem] = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=3, max_length=300)
    source: Literal["seller", "agent", "festival"] = "seller"
    actor: Optional[str] = Field(default=None, max_length=80)
    ref: Optional[str] = Field(default=None, max_length=40)


@router.post("/products/prices")
def change_prices(body: BulkIn, user: User = Depends(current_user), biz: Business = Depends(current_business),
                  db: Session = Depends(get_db)):
    """All or nothing: if any change needs approval, none are applied and the
    whole set goes to the approval queue as one request."""
    skus = [c.sku.upper() for c in body.changes]
    if len(set(skus)) != len(skus):
        raise ApiError(422, "duplicate_sku", "Each SKU can appear only once.", field="changes")
    actor = _actor(body.actor, body.source, user)
    needs, applied = [], []
    for c in body.changes:
        try:
            applied.append(svc.change_price(db, biz.id, c.sku, c.newPrice, reason=body.reason.strip(), source=body.source,
                                            actor=actor, user_id=user.id, expected_price=c.expectedPrice, ref=body.ref))
        except ApiError as e:
            if e.code != "needs_approval":
                db.rollback()
                raise ApiError(e.status, e.code, e.message, field=e.field, details={"sku": c.sku.upper(), **(e.details or {})})
            needs.append(e.details)
    if needs:
        db.rollback()
        msg = f"{len(needs)} of {len(body.changes)} price changes are outside your mandate. Nothing was changed yet."
        m = get_mandate(db, biz.id)
        if not m.approval_above_limit and body.source != "agent":
            raise ApiError(403, "outside_mandate", msg + " Approval requests are turned off in your mandate.", details={"items": needs})
        # Record what the products cost now, so approving later can't apply a stale change.
        current = {p.sku: p.price for p in db.scalars(select(Product).where(Product.business_id == biz.id,
                                                                            Product.sku.in_(skus))).all()}
        changes = [{"sku": c.sku.upper(), "newPrice": c.newPrice, "expectedPrice": c.expectedPrice or current.get(c.sku.upper())}
                   for c in body.changes]
        impact = sum(n["monthlyImpact"] for n in needs)
        a = approvals.queue(db, biz.id, action_type="bulk_price_change", agent_name=actor,
                            title=f"{body.reason.strip()[:120]} · {len(changes)} price changes",
                            description=msg + " " + "; ".join(f"{n['productName']}: {', '.join(n['violations'])}" for n in needs),
                            reasons=sorted({v for n in needs for v in n["violations"]}), financial_impact=impact,
                            payload={"changes": changes, "reason": body.reason.strip(), "ref": body.ref, "source": body.source},
                            dedupe_key=f"bulk:{body.ref or ''}:" + ",".join(f"{c['sku']}={c['newPrice']}" for c in changes)[:100])
        db.commit()
        return JSONResponse(status_code=202, content={"changes": [], "approval": approvals.out(a)})
    db.commit()
    return {"changes": [svc.out(pc) for pc in applied], "approval": None}


@router.get("/price-history")
def price_history(sku: Optional[str] = None, limit: int = Query(default=100, ge=1, le=500),
                  biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    stmt = select(PriceChange).where(PriceChange.business_id == biz.id)
    if sku:
        stmt = stmt.where(PriceChange.sku == sku.upper())
    rows = db.scalars(stmt.order_by(PriceChange.created_at.desc(), PriceChange.id).limit(limit)).all()
    return {"changes": [svc.out(r) for r in rows]}
