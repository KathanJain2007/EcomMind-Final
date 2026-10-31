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
from ..models import RFQ, Business, Negotiation, NegotiationMessage, Product, Supplier, SupplierQuote, User
from ..security import new_id
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
    existing = db.scalar(select(RFQ).where(RFQ.user_id == user.id, RFQ.idempotency_key == key))
    if existing:
        neg = db.scalar(select(Negotiation).where(Negotiation.rfq_id == existing.id))
        return {"rfq": rfq_out(existing), "negotiation": neg_out(db, neg), "replayed": True}

    supplier = db.get(Supplier, body.supplierId)
    if not supplier:
        raise ApiError(404, "supplier_not_found", "That supplier doesn't exist.", field="supplierId")
    sku = body.sku.upper()
    product = db.scalar(select(Product).where(Product.business_id == biz.id, Product.sku == sku))
    if not product:
        raise ApiError(422, "product_not_found", f"{sku} isn't in your catalogue.", field="sku")
    if body.targetUnitPrice and body.targetUnitPrice * body.quantity > 10**12:
        raise ApiError(422, "invalid_target", "Target price is too large.", field="targetUnitPrice")

    rfq = RFQ(id=new_id("RFQ"), business_id=biz.id, user_id=user.id, supplier_id=supplier.id, supplier_name=supplier.name,
              sku=sku, product_name=product.name, quantity=body.quantity, target_unit_price=body.targetUnitPrice,
              delivery_location=body.deliveryLocation.strip(), delivery_days=body.deliveryDays,
              status="quotation_requested", idempotency_key=key)
    neg = Negotiation(id=new_id("NEG"), rfq_id=rfq.id, business_id=biz.id, supplier_id=supplier.id, sku=sku,
                      quantity=body.quantity, status="quotation_requested")
    db.add(rfq)
    try:
        db.flush()  # the RFQ row must exist before the negotiation that references it
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "duplicate_request", "This quotation request was already submitted.")
    db.add(neg)
    db.flush()
    target = f" Target price {svc.inr(body.targetUnitPrice)} per unit." if body.targetUnitPrice else ""
    db.add(NegotiationMessage(negotiation_id=neg.id, sender="ecommind", kind="rfq",
                              text=f"Requesting {body.quantity} units of {product.name} ({sku}), delivery to "
                                   f"{rfq.delivery_location} within {body.deliveryDays} days.{target}"))
    svc.supplier_receive_rfq(db, neg, rfq, supplier)
    if neg.status == "offer_received":
        svc.ecommind_auto_counter(db, neg, rfq, supplier)
    log_activity(db, biz.id, agent="EcomMind", action=f"RFQ sent to {supplier.name.split('—')[0].strip()}", product=product.name,
                 status="info", detail=f"{body.quantity} units requested · {rfq.id}", ref=neg.id)
    db.commit()
    db.refresh(neg)
    return {"rfq": rfq_out(rfq), "negotiation": neg_out(db, neg), "replayed": False}


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
def accept(neg_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    n = _own_negotiation(db, biz, neg_id)
    svc.accept_offer(db, n)
    db.commit()
    db.refresh(n)
    return neg_out(db, n)


@router.post("/negotiations/{neg_id}/cancel")
def cancel(neg_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    n = _own_negotiation(db, biz, neg_id)
    svc.cancel(db, n)
    db.commit()
    db.refresh(n)
    return neg_out(db, n)
