"""Sales channels, listings, orders and stock movements."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business, idempotency_key
from ..errors import ApiError
from ..integrations import marketplaces as mk
from ..models import Business, MarketplaceListing, MarketplaceOrder, Product, StockMovement
from ..services import orders as svc
from ..services.ledger import log_activity

router = APIRouter(prefix="/api", tags=["marketplace"])

ChannelId = Literal["amazon", "flipkart", "meesho", "shopify", "instagram"]
ORDER_STATUSES = ("confirmed", "dispatched", "delivered", "cancelled", "returned")


@router.get("/marketplaces")
def marketplaces(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    listings = db.execute(select(MarketplaceListing.channel, func.count()).where(MarketplaceListing.business_id == biz.id)
                          .group_by(MarketplaceListing.channel)).all()
    lc = dict(listings)
    orders = db.execute(select(MarketplaceOrder.channel, MarketplaceOrder.status, func.count(), func.coalesce(func.sum(MarketplaceOrder.gross_amount), 0))
                        .where(MarketplaceOrder.business_id == biz.id).group_by(MarketplaceOrder.channel, MarketplaceOrder.status)).all()
    rev: dict[str, int] = {}
    pending: dict[str, int] = {}
    for ch, status, n, gross in orders:
        if status != "cancelled":
            rev[ch] = rev.get(ch, 0) + int(gross)
        if status in ("confirmed", "dispatched"):
            pending[ch] = pending.get(ch, 0) + int(n)
    out = []
    for ch in mk.CHANNELS.values():
        status, note = mk.connection_status(ch)
        out.append({"id": ch.id, "name": ch.name, "commissionPct": ch.commission_pct, "fixedFee": ch.fixed_fee,
                    "connection": status, "connectionNote": note, "credentialsRequired": list(ch.credential_env),
                    "apiDocs": ch.docs, "listings": int(lc.get(ch.id, 0)), "revenue": rev.get(ch.id, 0),
                    "pendingOrders": pending.get(ch.id, 0)})
    return {"marketplaces": out}


@router.get("/listings")
def list_listings(channel: Optional[ChannelId] = None, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    stmt = select(MarketplaceListing).where(MarketplaceListing.business_id == biz.id)
    if channel:
        stmt = stmt.where(MarketplaceListing.channel == channel)
    rows = db.scalars(stmt.order_by(MarketplaceListing.sku, MarketplaceListing.channel)).all()
    products = {p.sku: p for p in db.scalars(select(Product).where(Product.business_id == biz.id)).all()}
    stats = svc.listing_stats(db, biz.id)
    return {"listings": [svc.listing_out(l, products.get(l.sku), stats) for l in rows]}


class ListingIn(BaseModel):
    channel: ChannelId
    sku: str = Field(min_length=1, max_length=40)
    title: Optional[str] = Field(default=None, max_length=200)
    mrp: Optional[int] = Field(default=None, gt=0, le=10**12)


@router.post("/listings", status_code=201)
def create_listing(body: ListingIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    l = svc.create_listing(db, biz.id, body.channel, body.sku, body.title, body.mrp)
    db.commit()
    p = db.scalar(select(Product).where(Product.business_id == biz.id, Product.sku == l.sku))
    return svc.listing_out(l, p, {})


class ListingPatch(BaseModel):
    status: Optional[Literal["active", "paused"]] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    mrp: Optional[int] = Field(default=None, gt=0, le=10**12)


@router.patch("/listings/{listing_id}")
def update_listing(listing_id: str, body: ListingPatch, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    l = db.get(MarketplaceListing, listing_id)
    if not l or l.business_id != biz.id:
        raise ApiError(404, "listing_not_found", "Listing not found.")
    p = db.scalar(select(Product).where(Product.business_id == biz.id, Product.sku == l.sku))
    if body.mrp is not None and p and body.mrp < p.price:
        raise ApiError(422, "invalid_mrp", "MRP can't be below the selling price.", field="mrp")
    if body.status and body.status != l.status:
        l.status = body.status
        ch = mk.get(l.channel)
        log_activity(db, biz.id, agent="Seller", action=f"{ch.name if ch else l.channel} listing {body.status}: {p.name if p else l.sku}",
                     product=p.name if p else None, status="info", ref=l.id)
    if body.title:
        l.title = body.title.strip()
    if body.mrp is not None:
        l.mrp = body.mrp
    from datetime import datetime, timezone
    l.updated_at = datetime.now(timezone.utc)
    db.commit()
    return svc.listing_out(l, p, svc.listing_stats(db, biz.id))


class OrderIn(BaseModel):
    channel: ChannelId
    sku: str = Field(min_length=1, max_length=40)
    quantity: int = Field(gt=0, le=10_000)
    customerCity: Optional[str] = Field(default=None, max_length=80)
    customerState: Optional[str] = Field(default=None, max_length=80)
    customerPincode: Optional[str] = Field(default=None, pattern=r"^[1-9][0-9]{5}$")
    externalOrderId: Optional[str] = Field(default=None, max_length=80)


@router.post("/orders", status_code=201)
def place_order(body: OrderIn, key: str = Depends(idempotency_key), biz: Business = Depends(current_business),
                db: Session = Depends(get_db)):
    o, replayed = svc.place_order(db, biz.id, channel=body.channel, sku=body.sku, quantity=body.quantity, idempotency_key=key,
                                  customer_city=(body.customerCity or "").strip() or None,
                                  customer_state=(body.customerState or "").strip() or None,
                                  customer_pincode=body.customerPincode, external_order_id=body.externalOrderId)
    db.commit()
    p = db.scalar(select(Product).where(Product.business_id == biz.id, Product.sku == o.sku))
    return {"order": svc.order_out(o), "stock": p.stock if p else None, "replayed": replayed}


@router.get("/orders")
def list_orders(channel: Optional[ChannelId] = None, status: Optional[str] = None, sku: Optional[str] = None,
                limit: int = Query(default=200, ge=1, le=500), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    stmt = select(MarketplaceOrder).where(MarketplaceOrder.business_id == biz.id)
    if channel:
        stmt = stmt.where(MarketplaceOrder.channel == channel)
    if status:
        if status not in ORDER_STATUSES:
            raise ApiError(422, "invalid_status", "Unknown order status.", field="status")
        stmt = stmt.where(MarketplaceOrder.status == status)
    if sku:
        stmt = stmt.where(MarketplaceOrder.sku == sku.upper())
    rows = db.scalars(stmt.order_by(MarketplaceOrder.created_at.desc()).limit(limit)).all()
    return {"orders": [svc.order_out(o) for o in rows]}


@router.get("/orders/summary")
def orders_summary(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(select(MarketplaceOrder).where(MarketplaceOrder.business_id == biz.id,
                                                     MarketplaceOrder.status != "cancelled")).all()
    gross = sum(o.gross_amount for o in rows)
    net = sum(o.net_profit for o in rows if o.status != "returned")
    return {"orders": len(rows), "units": sum(o.quantity for o in rows), "grossRevenue": gross,
            "commission": sum(o.commission for o in rows),
            "unitsDelivered": sum(o.quantity for o in rows if o.status == "delivered"),
            "returned": sum(1 for o in rows if o.status == "returned"),
            "netProfit": net, "netMarginPct": round(net / gross * 100, 1) if gross else None}


@router.post("/orders/{order_id}/{action}")
def order_action(order_id: str, action: Literal["dispatch", "deliver", "cancel", "return"],
                 biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    o = db.get(MarketplaceOrder, order_id)
    if not o or o.business_id != biz.id:
        raise ApiError(404, "order_not_found", "Order not found.")
    svc.transition(db, o, action)
    db.commit()
    return {"order": svc.order_out(o)}


@router.get("/stock-movements")
def stock_movements(sku: Optional[str] = None, limit: int = Query(default=100, ge=1, le=500),
                    biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    stmt = select(StockMovement).where(StockMovement.business_id == biz.id)
    if sku:
        stmt = stmt.where(StockMovement.sku == sku.upper())
    rows = db.scalars(stmt.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit)).all()
    names = {p.sku: p.name for p in db.scalars(select(Product).where(Product.business_id == biz.id)).all()}
    return {"movements": [svc.movement_out(m, names) for m in rows]}


class AdjustIn(BaseModel):
    delta: int = Field(ge=-1_000_000, le=1_000_000)
    reason: str = Field(min_length=3, max_length=300)


@router.post("/products/{sku}/stock-adjustments", status_code=201)
def adjust(sku: str, body: AdjustIn, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    if body.delta == 0:
        raise ApiError(422, "no_change", "Enter a non-zero quantity.", field="delta")
    p = db.scalar(select(Product).where(Product.business_id == biz.id, Product.sku == sku.upper()))
    if not p:
        raise ApiError(404, "product_not_found", f"{sku.upper()} isn't in your catalogue.")
    svc.adjust_stock(db, p, body.delta, "adjustment", body.reason.strip())
    log_activity(db, biz.id, agent="Seller", action=f"Stock adjusted: {p.name} {body.delta:+d}", product=p.name,
                 status="info", detail=f"{body.reason.strip()} · now {p.stock} units")
    db.commit()
    return {"sku": p.sku, "stock": p.stock}
