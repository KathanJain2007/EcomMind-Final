"""Suppliers, RFQs and negotiations."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business, current_user, idempotency_key
from ..errors import ApiError
from ..models import RFQ, Business, Escrow, Negotiation, NegotiationMessage, Product, Supplier, SupplierQuote, User
from ..security import new_id
from fastapi.responses import JSONResponse

from ..services import approvals
from ..services import escrow as escrow_svc
from ..services import negotiation as svc
from ..services.ledger import log_activity

router = APIRouter(prefix="/api", tags=["rfq"])

STATUS_LABELS = {
    "quotation_requested": "Quotation requested",
    "awaiting_supplier_response": "Awaiting supplier response",
    "negotiation_in_progress": "Negotiation in progress",
    "offer_received": "Offer received",
    "agreed": "Deal agreed",
    "declined": "Declined by supplier",
    "cancelled": "Cancelled",
}


def quote_out(q: SupplierQuote) -> dict:
    # floor_price is the supplier agent's private limit and is never exposed.
    return {"id": q.id, "supplierId": q.supplier_id, "sku": q.sku, "unitPrice": q.unit_price, "deliveryDays": q.delivery_days,
            "moq": q.moq, "available": q.available, "validTill": q.valid_till.isoformat()}


def supplier_out(s: Supplier, quotes: list[SupplierQuote]) -> dict:
    return {"id": s.id, "name": s.name, "agentId": s.agent_id, "location": s.location, "rating": s.rating,
            "reviews": s.reviews, "verified": s.verified, "autoRespond": s.auto_respond,
            "catalogue": [q.sku for q in quotes], "quotes": [quote_out(q) for q in quotes]}


@router.get("/suppliers")
def suppliers(_: User = Depends(current_user), db: Session = Depends(get_db)):
    sups = db.scalars(select(Supplier).order_by(Supplier.id)).all()
    quotes = db.scalars(select(SupplierQuote).order_by(SupplierQuote.id)).all()
    return {"suppliers": [supplier_out(s, [q for q in quotes if q.supplier_id == s.id]) for s in sups]}


@router.get("/supplier-quotes")
def supplier_quotes(sku: str | None = None, maxPrice: int | None = Query(default=None, ge=0), maxDays: int | None = Query(default=None, ge=0),
                    _: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(SupplierQuote).order_by(SupplierQuote.id)
    if sku and sku != "All":
        q = q.where(SupplierQuote.sku == sku.upper())
    if maxPrice is not None:
        q = q.where(SupplierQuote.unit_price <= maxPrice)
    if maxDays is not None:
        q = q.where(SupplierQuote.delivery_days <= maxDays)
    return {"quotes": [quote_out(x) for x in db.scalars(q).all()]}


class RFQIn(BaseModel):
    supplierId: str = Field(min_length=1, max_length=20)
    sku: str = Field(min_length=1, max_length=40)
    quantity: int = Field(ge=1, le=1_000_000)
    targetUnitPrice: int | None = Field(default=None, gt=0, description="paise")
    deliveryLocation: str = Field(min_length=2, max_length=300)
    deliveryDays: int = Field(ge=1, le=120)


def rfq_out(r: RFQ) -> dict:
    return {"id": r.id, "supplierId": r.supplier_id, "supplierName": r.supplier_name, "sku": r.sku, "productName": r.product_name,
            "quantity": r.quantity, "targetUnitPrice": r.target_unit_price, "deliveryLocation": r.delivery_location,
            "deliveryDays": r.delivery_days, "status": r.status, "statusLabel": STATUS_LABELS.get(r.status, r.status),
            "createdAt": r.created_at.isoformat()}


def neg_out(db: Session, n: Negotiation, with_messages: bool = True) -> dict:
    rfq = db.get(RFQ, n.rfq_id)
    out = {"id": n.id, "rfqId": n.rfq_id, "supplierId": n.supplier_id, "supplierName": rfq.supplier_name, "sku": n.sku,
           "productName": rfq.product_name, "quantity": n.quantity, "status": n.status,
           "statusLabel": STATUS_LABELS.get(n.status, n.status), "latestSupplierPrice": n.latest_supplier_price,
           "latestBuyerPrice": n.latest_buyer_price, "agreedUnitPrice": n.agreed_unit_price,
           "supplierDeliveryDays": n.supplier_delivery_days, "rounds": n.rounds,
           "createdAt": n.created_at.isoformat(), "updatedAt": n.updated_at.isoformat(), "rfq": rfq_out(rfq)}
    esc = db.scalar(select(Escrow).where(Escrow.negotiation_id == n.id))
    out["escrow"] = ({"id": esc.id, "status": esc.status, "statusLabel": escrow_svc.LABELS[esc.status],
                      "amount": esc.amount, "statusNote": esc.status_note} if esc else None)
    if with_messages:
        out["messages"] = [{"id": m.id, "sender": m.sender, "kind": m.kind, "unitPrice": m.unit_price, "text": m.text,
                            "createdAt": m.created_at.isoformat()} for m in n.messages]
    return out


def _own_negotiation(db: Session, biz: Business, neg_id: str) -> Negotiation:
    n = db.get(Negotiation, neg_id)
    if not n or n.business_id != biz.id:
        raise ApiError(404, "negotiation_not_found", "Negotiation not found.")
    return n


@router.post("/rfqs", status_code=201)
def create_rfq(body: RFQIn, key: str = Depends(idempotency_key), user: User = Depends(current_user),
               biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rfq, neg, replayed = svc.create_rfq(db, biz.id, user.id, supplier_id=body.supplierId, sku=body.sku, quantity=body.quantity,
                                        target_unit_price=body.targetUnitPrice, delivery_location=body.deliveryLocation,
                                        delivery_days=body.deliveryDays, idempotency_key=key)
    if not replayed:
        db.commit()
        db.refresh(neg)
    return {"rfq": rfq_out(rfq), "negotiation": neg_out(db, neg), "replayed": replayed}


@router.get("/rfqs")
def list_rfqs(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(select(RFQ).where(RFQ.business_id == biz.id).order_by(RFQ.created_at.desc())).all()
    return {"rfqs": [rfq_out(r) for r in rows]}


@router.get("/negotiations")
def list_negotiations(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(select(Negotiation).where(Negotiation.business_id == biz.id).order_by(Negotiation.updated_at.desc())).all()
    return {"negotiations": [neg_out(db, n, with_messages=False) for n in rows]}


@router.get("/negotiations/{neg_id}")
def get_negotiation(neg_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    return neg_out(db, _own_negotiation(db, biz, neg_id))


class CounterIn(BaseModel):
    unitPrice: int = Field(gt=0, description="paise")


@router.post("/negotiations/{neg_id}/counter")
def counter(neg_id: str, body: CounterIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    n = _own_negotiation(db, biz, neg_id)
    svc.seller_counter(db, n, body.unitPrice)
    db.commit()
    db.refresh(n)
    return neg_out(db, n)


@router.post("/negotiations/{neg_id}/accept")
def accept(neg_id: str, user: User = Depends(current_user), biz: Business = Depends(current_business),
           db: Session = Depends(get_db)):
    n = _own_negotiation(db, biz, neg_id)
    result, obj = svc.request_accept(db, n, user.id, agent_name=f"Seller · {user.name}"[:80])
    db.commit()
    db.refresh(n)
    if result == "queued":
        return JSONResponse(status_code=202, content={**neg_out(db, n), "approval": approvals.out(obj)})
    return neg_out(db, n)


@router.post("/negotiations/{neg_id}/cancel")
def cancel(neg_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    n = _own_negotiation(db, biz, neg_id)
    svc.cancel(db, n)
    db.commit()
    db.refresh(n)
    return neg_out(db, n)
