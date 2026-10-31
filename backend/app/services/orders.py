"""Marketplace listings, orders and stock.

Placing an order takes stock with one conditional UPDATE
(``stock = stock - q WHERE stock >= q``) inside a BEGIN IMMEDIATE
transaction, so two channels can never sell the same last unit. Every stock
change writes a stock_movements row, and every order feeds sales_daily (and
return_stats when a pincode is known), which the analytics pages read.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..integrations import marketplaces as mk
from ..models import MarketplaceListing, MarketplaceOrder, Product, ReturnStat, SalesDaily, StockMovement
from ..security import new_id
from .ledger import IST, log_activity

LOW_STOCK_DAYS = 7


def inr(paise: int) -> str:
    r = paise / 100
    return f"₹{r:,.0f}" if r == int(r) else f"₹{r:,.2f}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def record_movement(db: Session, p: Product, delta: int, kind: str, reason: str, *, channel: Optional[str] = None,
                    ref: Optional[str] = None) -> StockMovement:
    m = StockMovement(business_id=p.business_id, sku=p.sku, delta=delta, resulting_stock=p.stock, kind=kind,
                      channel=channel, reason=reason[:300], ref=ref)
    db.add(m)
    return m


def adjust_stock(db: Session, p: Product, delta: int, kind: str, reason: str, *, channel: Optional[str] = None,
                 ref: Optional[str] = None) -> None:
    """Atomically change stock; refuses to go below zero."""
    if delta < 0:
        res = db.execute(update(Product).where(Product.id == p.id, Product.stock >= -delta).values(stock=Product.stock + delta))
        if res.rowcount != 1:
            db.refresh(p)
            raise ApiError(409, "insufficient_stock", f"Only {p.stock} units of {p.name} are in stock.",
                           details={"sku": p.sku, "available": p.stock})
    else:
        db.execute(update(Product).where(Product.id == p.id).values(stock=Product.stock + delta))
    db.refresh(p)
    record_movement(db, p, delta, kind, reason, channel=channel, ref=ref)


def _sales(db: Session, business_id: int, day: date, sku: str, units: int, orders: int, revenue: int) -> None:
    row = db.scalar(select(SalesDaily).where(SalesDaily.business_id == business_id, SalesDaily.day == day, SalesDaily.sku == sku))
    if row:
        row.units = max(0, row.units + units)
        row.orders = max(0, row.orders + orders)
        row.revenue = max(0, row.revenue + revenue)
    elif units > 0:
        db.add(SalesDaily(business_id=business_id, day=day, sku=sku, units=units, orders=orders, revenue=revenue))


def _return_stat(db: Session, business_id: int, pincode: str, city: Optional[str], sku: str, orders: int, returns: int) -> None:
    row = db.scalar(select(ReturnStat).where(ReturnStat.business_id == business_id, ReturnStat.pincode == pincode,
                                             ReturnStat.sku == sku))
    if row:
        row.orders = max(0, row.orders + orders)
        row.returns = max(0, row.returns + returns)
    elif orders > 0:
        db.add(ReturnStat(business_id=business_id, pincode=pincode, city=(city or "")[:80], sku=sku, orders=orders, returns=returns))


# --------------------------------------------------------------------------- listings

def listing_stats(db: Session, business_id: int) -> dict[str, dict]:
    rows = db.execute(select(MarketplaceOrder.listing_id, MarketplaceOrder.quantity, MarketplaceOrder.gross_amount, MarketplaceOrder.status)
                      .where(MarketplaceOrder.business_id == business_id)).all()
    out: dict[str, dict] = {}
    for lid, q, gross, status in rows:
        s = out.setdefault(lid, {"orders": 0, "units": 0, "revenue": 0})
        if status != "cancelled":
            s["orders"] += 1
            s["units"] += q
            s["revenue"] += gross
    return out


def listing_out(l: MarketplaceListing, p: Optional[Product], stats: dict) -> dict:
    ch = mk.get(l.channel)
    st = stats.get(l.id, {"orders": 0, "units": 0, "revenue": 0})
    stock = p.stock if p else 0
    status = l.status
    if status == "active" and (not p or stock == 0):
        status = "out_of_stock"
    if p and p.paused and status == "active":
        status = "paused"
    return {"id": l.id, "channel": l.channel, "channelName": ch.name if ch else l.channel, "sku": l.sku,
            "productName": p.name if p else l.sku, "title": l.title, "price": p.price if p else 0, "mrp": l.mrp,
            "stock": stock, "status": status, "listingStatus": l.status, "externalListingId": l.external_listing_id,
            "commissionPct": ch.commission_pct if ch else 0, "ordersCount": st["orders"], "unitsSold": st["units"],
            "revenue": st["revenue"], "createdAt": l.created_at.isoformat(), "updatedAt": l.updated_at.isoformat()}


def create_listing(db: Session, business_id: int, channel: str, sku: str, title: Optional[str], mrp: Optional[int]) -> MarketplaceListing:
    ch = mk.get(channel)
    if not ch:
        raise ApiError(422, "unknown_channel", "Unknown sales channel.", field="channel")
    p = db.scalar(select(Product).where(Product.business_id == business_id, Product.sku == sku.upper()))
    if not p:
        raise ApiError(404, "product_not_found", f"{sku.upper()} isn't in your catalogue.", field="sku")
    if db.scalar(select(MarketplaceListing.id).where(MarketplaceListing.business_id == business_id,
                                                     MarketplaceListing.channel == channel, MarketplaceListing.sku == p.sku)):
        raise ApiError(409, "already_listed", f"{p.name} is already listed on {ch.name}.", field="sku")
    if mrp is not None and mrp < p.price:
        raise ApiError(422, "invalid_mrp", "MRP can't be below the selling price.", field="mrp")
    l = MarketplaceListing(id=new_id("LST"), business_id=business_id, channel=channel, sku=p.sku,
                           title=(title or p.name).strip()[:200], mrp=mrp, status="active")
    db.add(l)
    log_activity(db, business_id, agent="Seller", action=f"Listed {p.name} on {ch.name}", product=p.name, status="success",
                 detail=f"{l.id} · sells at the catalogue price {inr(p.price)} from shared stock", ref=l.id)
    return l


# --------------------------------------------------------------------------- orders

def order_out(o: MarketplaceOrder) -> dict:
    ch = mk.get(o.channel)
    iso = lambda d: d.isoformat() if d else None  # noqa: E731
    return {"id": o.id, "channel": o.channel, "channelName": ch.name if ch else o.channel, "listingId": o.listing_id,
            "sku": o.sku, "productName": o.product_name, "quantity": o.quantity, "unitPrice": o.unit_price,
            "grossAmount": o.gross_amount, "commission": o.commission, "shippingCost": o.shipping_cost,
            "packagingCost": o.packaging_cost, "taxAmount": o.tax_amount, "netProfit": o.net_profit, "status": o.status,
            "customerCity": o.customer_city, "customerState": o.customer_state, "customerPincode": o.customer_pincode,
            "externalOrderId": o.external_order_id, "createdAt": iso(o.created_at), "dispatchedAt": iso(o.dispatched_at),
            "deliveredAt": iso(o.delivered_at), "cancelledAt": iso(o.cancelled_at), "returnedAt": iso(o.returned_at)}


def place_order(db: Session, business_id: int, *, channel: str, sku: str, quantity: int, idempotency_key: str,
                customer_city: Optional[str] = None, customer_state: Optional[str] = None,
                customer_pincode: Optional[str] = None, external_order_id: Optional[str] = None) -> tuple[MarketplaceOrder, bool]:
    existing = db.scalar(select(MarketplaceOrder).where(MarketplaceOrder.business_id == business_id,
                                                        MarketplaceOrder.idempotency_key == idempotency_key))
    if existing:
        return existing, True
    ch = mk.get(channel)
    if not ch:
        raise ApiError(422, "unknown_channel", "Unknown sales channel.", field="channel")
    p = db.scalar(select(Product).where(Product.business_id == business_id, Product.sku == sku.upper()))
    if not p:
        raise ApiError(404, "product_not_found", f"{sku.upper()} isn't in your catalogue.", field="sku")
    listing = db.scalar(select(MarketplaceListing).where(MarketplaceListing.business_id == business_id,
                                                         MarketplaceListing.channel == channel, MarketplaceListing.sku == p.sku))
    if not listing:
        raise ApiError(422, "not_listed", f"{p.name} isn't listed on {ch.name}. List it first.", field="sku")
    if listing.status != "active" or p.paused:
        raise ApiError(409, "listing_paused", f"The {ch.name} listing for {p.name} is paused.")

    order_id = new_id("ORD")
    adjust_stock(db, p, -quantity, "sale", f"{ch.name} order {order_id}", channel=channel, ref=order_id)

    gross = p.price * quantity
    commission = round(gross * ch.commission_pct / 100) + ch.fixed_fee
    shipping, packaging = mk.SHIPPING_PER_UNIT * quantity, mk.PACKAGING_PER_UNIT * quantity
    tax = round(gross * mk.GST_PCT / (100 + mk.GST_PCT))
    net = gross - tax - p.cost * quantity - commission - shipping - packaging
    today = datetime.now(IST).date()
    o = MarketplaceOrder(id=order_id, business_id=business_id, channel=channel, listing_id=listing.id, sku=p.sku,
                         product_name=p.name, quantity=quantity, unit_price=p.price, unit_cost=p.cost, gross_amount=gross,
                         commission=commission, shipping_cost=shipping, packaging_cost=packaging, tax_amount=tax,
                         net_profit=net, status="confirmed", sale_day=today, customer_city=customer_city,
                         customer_state=customer_state, customer_pincode=customer_pincode,
                         external_order_id=external_order_id, idempotency_key=idempotency_key)
    db.add(o)
    _sales(db, business_id, today, p.sku, quantity, 1, gross)
    if customer_pincode:
        _return_stat(db, business_id, customer_pincode, customer_city, p.sku, 1, 0)
    log_activity(db, business_id, agent=f"{ch.name} order", action=f"Order {order_id}: {quantity} × {p.name}",
                 product=p.name, amount=gross, status="success",
                 detail=f"{inr(gross)} · est. net {inr(net)} after commission, GST, shipping and packaging · stock now {p.stock}",
                 ref=order_id)
    days = p.stock / p.avg_daily_sales if p.avg_daily_sales else None
    if p.stock == 0 or (days is not None and days < LOW_STOCK_DAYS):
        log_activity(db, business_id, agent="EcomMind", action=f"Low stock: {p.name}", product=p.name, status="warning",
                     detail=f"{p.stock} units left" + (f" · about {days:.1f} days of cover" if days is not None else ""), ref=p.sku)
    return o, False


TRANSITIONS = {
    "dispatch": (("confirmed",), "dispatched", "dispatched_at"),
    "deliver": (("dispatched",), "delivered", "delivered_at"),
    "cancel": (("confirmed", "dispatched"), "cancelled", "cancelled_at"),
    "return": (("delivered",), "returned", "returned_at"),
}


def transition(db: Session, o: MarketplaceOrder, action: str) -> None:
    allowed, target, stamp = TRANSITIONS[action]
    if o.status == target:
        return  # idempotent
    res = db.execute(update(MarketplaceOrder).where(MarketplaceOrder.id == o.id, MarketplaceOrder.status.in_(allowed))
                     .values(status=target, **{stamp: _now()}))
    if res.rowcount != 1:
        raise ApiError(409, "invalid_transition", f"An order that is {o.status} can't be marked {target}.")
    db.refresh(o)
    p = db.scalar(select(Product).where(Product.business_id == o.business_id, Product.sku == o.sku))
    ch = mk.get(o.channel)
    if action == "cancel":
        if p:
            adjust_stock(db, p, o.quantity, "cancellation", f"Order {o.id} cancelled", channel=o.channel, ref=o.id)
        _sales(db, o.business_id, o.sale_day, o.sku, -o.quantity, -1, -o.gross_amount)
        if o.customer_pincode:
            _return_stat(db, o.business_id, o.customer_pincode, o.customer_city, o.sku, -1, 0)
    elif action == "return":
        if p:
            adjust_stock(db, p, o.quantity, "return", f"Order {o.id} returned by the customer", channel=o.channel, ref=o.id)
        if o.customer_pincode:
            _return_stat(db, o.business_id, o.customer_pincode, o.customer_city, o.sku, 0, 1)
    log_activity(db, o.business_id, agent=f"{ch.name if ch else o.channel} order", action=f"Order {o.id} {target}",
                 product=o.product_name, status="warning" if action in ("cancel", "return") else "info",
                 detail=f"{o.quantity} × {o.product_name}" + (" · stock restored" if action in ("cancel", "return") else ""), ref=o.id)


def movement_out(m: StockMovement, names: dict[str, str]) -> dict:
    return {"id": m.id, "sku": m.sku, "productName": names.get(m.sku, m.sku), "delta": m.delta,
            "resultingStock": m.resulting_stock, "kind": m.kind, "channel": m.channel, "reason": m.reason, "ref": m.ref,
            "createdAt": m.created_at.isoformat()}
