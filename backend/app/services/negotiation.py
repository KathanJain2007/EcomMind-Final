"""RFQ -> negotiation workflow.

Supplier replies come only from suppliers whose agent auto-responds
(`Supplier.auto_respond`). Their policy is deterministic and uses the
supplier's private floor price from `supplier_quotes`:

* RFQ received  -> offer at the listed unit price (or decline if the SKU isn't
  in their catalogue).
* Counter >= floor -> accept.  Counter < floor -> final offer at the floor.

Suppliers that don't auto-respond leave the negotiation in
"awaiting_supplier_response"; nothing is invented on their behalf.

EcomMind's own counter (when the mandate allows automatic negotiation and the
seller gave a target price) is one counter at the target price. Accepting a
deal is always a seller action, checked against the mandate, and never moves
money: it records the agreement only.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import RFQ, Negotiation, NegotiationMessage, Supplier, SupplierQuote
from .ledger import budget_consumed_today, get_mandate, log_activity

MAX_ROUNDS = 6


def inr(paise: int | None) -> str:
    if paise is None:
        return "—"
    r = paise / 100
    return f"₹{r:,.0f}" if r == int(r) else f"₹{r:,.2f}"


def _msg(db: Session, neg: Negotiation, sender: str, kind: str, text: str, price: int | None = None) -> None:
    db.add(NegotiationMessage(negotiation_id=neg.id, sender=sender, kind=kind, unit_price=price, text=text))
    neg.updated_at = datetime.now(timezone.utc)


def _quote(db: Session, supplier_id: str, sku: str) -> SupplierQuote | None:
    return db.scalar(select(SupplierQuote).where(SupplierQuote.supplier_id == supplier_id, SupplierQuote.sku == sku))


def supplier_receive_rfq(db: Session, neg: Negotiation, rfq: RFQ, supplier: Supplier) -> None:
    if not supplier.auto_respond:
        neg.status = rfq.status = "awaiting_supplier_response"
        _msg(db, neg, "system", "info", f"RFQ delivered to {supplier.name}. Waiting for the supplier's response.")
        return
    q = _quote(db, supplier.id, rfq.sku)
    if not q:
        neg.status = rfq.status = "declined"
        _msg(db, neg, "supplier", "decline", f"We don't supply {rfq.product_name} ({rfq.sku}) at the moment.")
        return
    if q.valid_till < date.today():
        neg.status = rfq.status = "awaiting_supplier_response"
        _msg(db, neg, "system", "info", "The supplier's price list has expired. Waiting for a fresh quote.")
        return
    notes = []
    if rfq.quantity < q.moq:
        notes.append(f"Minimum order is {q.moq} units.")
    if rfq.quantity > q.available:
        notes.append(f"Only {q.available:,} units are available right now.")
    if q.delivery_days > rfq.delivery_days:
        notes.append(f"Our delivery time is {q.delivery_days} days, longer than the {rfq.delivery_days} days requested.")
    text = f"Offer: {inr(q.unit_price)} per unit for {rfq.quantity} units, delivery in {q.delivery_days} days."
    if notes:
        text += " " + " ".join(notes)
    neg.latest_supplier_price = q.unit_price
    neg.supplier_delivery_days = q.delivery_days
    neg.status = rfq.status = "offer_received"
    _msg(db, neg, "supplier", "offer", text, q.unit_price)


def supplier_receive_counter(db: Session, neg: Negotiation, supplier: Supplier, price: int) -> None:
    if not supplier.auto_respond:
        neg.status = "awaiting_supplier_response"
        return
    q = _quote(db, supplier.id, neg.sku)
    floor = q.floor_price if q else neg.latest_supplier_price or price
    if price >= floor:
        neg.latest_supplier_price = price
        neg.status = "offer_received"
        _msg(db, neg, "supplier", "accept", f"We accept {inr(price)} per unit. Confirm to finalise the deal.", price)
    else:
        neg.latest_supplier_price = floor
        neg.status = "offer_received"
        _msg(db, neg, "supplier", "offer",
             f"Final offer: {inr(floor)} per unit for {neg.quantity} units. This is our floor for this order.", floor)


def ecommind_auto_counter(db: Session, neg: Negotiation, rfq: RFQ, supplier: Supplier) -> None:
    """One automatic counter at the seller's target price, if the mandate allows."""
    mandate = get_mandate(db, neg.business_id)
    if not (mandate.auto_negotiation and rfq.target_unit_price and neg.latest_supplier_price):
        return
    if rfq.target_unit_price >= neg.latest_supplier_price:
        return
    neg.rounds += 1
    neg.latest_buyer_price = rfq.target_unit_price
    neg.status = "negotiation_in_progress"
    _msg(db, neg, "ecommind", "counter",
         f"Counter-offer: {inr(rfq.target_unit_price)} per unit (your target price) for {neg.quantity} units.",
         rfq.target_unit_price)
    supplier_receive_counter(db, neg, supplier, rfq.target_unit_price)


def seller_counter(db: Session, neg: Negotiation, price: int) -> None:
    if neg.status in {"agreed", "declined", "cancelled"}:
        raise ApiError(409, "negotiation_closed", "This negotiation is already closed.")
    if neg.status == "awaiting_supplier_response":
        raise ApiError(409, "awaiting_supplier", "Wait for the supplier's response before countering.")
    if neg.rounds >= MAX_ROUNDS:
        raise ApiError(409, "too_many_rounds", f"Negotiations are limited to {MAX_ROUNDS} counter-offers.")
    if price <= 0:
        raise ApiError(422, "invalid_price", "Enter a unit price greater than zero.", field="unitPrice")
    supplier = db.get(Supplier, neg.supplier_id)
    neg.rounds += 1
    neg.latest_buyer_price = price
    neg.status = "negotiation_in_progress"
    _msg(db, neg, "seller", "counter", f"Counter-offer: {inr(price)} per unit for {neg.quantity} units.", price)
    supplier_receive_counter(db, neg, supplier, price)


def accept_offer(db: Session, neg: Negotiation) -> None:
    if neg.status == "agreed":
        return  # idempotent
    if neg.status != "offer_received" or not neg.latest_supplier_price:
        raise ApiError(409, "no_offer", "There is no supplier offer to accept yet.")
    mandate = get_mandate(db, neg.business_id)
    total = neg.latest_supplier_price * neg.quantity
    if mandate.agents_paused:
        raise ApiError(403, "agents_paused", "All agents are paused. Resume EcomMind before confirming deals.")
    if total > mandate.max_order_value:
        raise ApiError(403, "mandate_max_order_value",
                       f"Order value {inr(total)} is above your mandate's {inr(mandate.max_order_value)} per-order limit. "
                       "Raise the limit in Settings or reduce the quantity.")
    remaining = mandate.daily_budget - budget_consumed_today(db, neg.business_id)
    if total > remaining:
        raise ApiError(403, "mandate_daily_budget",
                       f"Order value {inr(total)} is above today's remaining mandate budget of {inr(max(0, remaining))}.")
    neg.agreed_unit_price = neg.latest_supplier_price
    neg.status = "agreed"
    rfq = db.get(RFQ, neg.rfq_id)
    rfq.status = "agreed"
    _msg(db, neg, "seller", "accept",
         f"Deal confirmed at {inr(neg.agreed_unit_price)} per unit · total {inr(total)}. "
         "No money has moved: lock funds in escrow as the next step.", neg.agreed_unit_price)
    supplier = db.get(Supplier, neg.supplier_id)
    log_activity(db, neg.business_id, agent="EcomMind", action=f"Deal agreed with {supplier.name.split('—')[0].strip()}",
                 product=rfq.product_name, amount=total, status="success",
                 detail=f"{neg.quantity} units at {inr(neg.agreed_unit_price)} · {rfq.id} / {neg.id}", ref=neg.id)


def cancel(db: Session, neg: Negotiation) -> None:
    if neg.status in {"agreed"}:
        raise ApiError(409, "negotiation_closed", "An agreed deal can't be cancelled here.")
    neg.status = "cancelled"
    db.get(RFQ, neg.rfq_id).status = "cancelled"
    _msg(db, neg, "seller", "info", "Negotiation cancelled by the seller.")
