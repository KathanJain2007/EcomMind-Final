"""RFQ -> negotiation workflow.

Supplier replies come from suppliers whose agent auto-responds
(`Supplier.auto_respond`), which includes unverified and seller-imported ones.
Their policy is deterministic and uses the floor price from `supplier_quotes`
(an imported quote's floor is its listed price):

* RFQ received  -> offer at the listed unit price (or decline if the SKU isn't
  in their catalogue).
* Counter >= floor -> accept.  Counter < floor -> final offer at the floor.

Suppliers with auto-respond off leave the negotiation in
"awaiting_supplier_response"; nothing is invented on their behalf.

EcomMind's own counter (when the mandate allows automatic negotiation and the
seller gave a target price) is one counter at the target price. Accepting a
deal is checked against the mandate; deals above its limits go to the approval
queue. An accepted deal opens an escrow and locks the funds when the wallet
covers them.
"""
from __future__ import annotations

from typing import Optional

from datetime import date, datetime, timezone

from sqlalchemy import or_, select
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


def _quote(db: Session, business_id: int, supplier_id: str, sku: str) -> SupplierQuote | None:
    # A supplier's own network quote wins; otherwise it answers from the quote this seller imported for it.
    rows = db.scalars(select(SupplierQuote).where(SupplierQuote.supplier_id == supplier_id, SupplierQuote.sku == sku,
                                                  or_(SupplierQuote.business_id.is_(None),
                                                      SupplierQuote.business_id == business_id))).all()
    return next((q for q in rows if q.business_id is None), rows[0] if rows else None)


def supplier_receive_rfq(db: Session, neg: Negotiation, rfq: RFQ, supplier: Supplier) -> None:
    if not supplier.auto_respond:
        neg.status = rfq.status = "awaiting_supplier_response"
        _msg(db, neg, "system", "info", f"RFQ delivered to {supplier.name}. Waiting for the supplier's response.")
        return
    q = _quote(db, neg.business_id, supplier.id, rfq.sku)
    if not q:
        neg.status = rfq.status = "declined"
        _msg(db, neg, "supplier", "decline", f"We don't supply {rfq.product_name} ({rfq.sku}) at the moment.")
        return
    notes = []
    if q.valid_till < date.today():
        notes.append(f"Our listed price expired on {q.valid_till:%d %b %Y}; this offer re-confirms it.")
    if rfq.quantity < q.moq:
        notes.append(f"Minimum order is {q.moq} units.")
    # An imported quote with no stock figure is stored as 0, which means "not stated", not "sold out".
    if rfq.quantity > q.available and (q.available or q.business_id is None):
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
    q = _quote(db, neg.business_id, supplier.id, neg.sku)
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


def answer_waiting_negotiations(db: Session) -> int:
    """Reply to negotiations left waiting on a supplier whose agent now auto-responds."""
    answered = 0
    for neg in db.scalars(select(Negotiation).where(Negotiation.status == "awaiting_supplier_response")).all():
        supplier = db.get(Supplier, neg.supplier_id)
        rfq = db.get(RFQ, neg.rfq_id)
        if not supplier or not supplier.auto_respond or not rfq:
            continue
        if neg.latest_buyer_price:
            supplier_receive_counter(db, neg, supplier, neg.latest_buyer_price)
        else:
            supplier_receive_rfq(db, neg, rfq, supplier)
            ecommind_auto_counter(db, neg, rfq, supplier)
        answered += 1
    return answered


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


def accept_offer(db: Session, neg: Negotiation, user_id: int, approved: bool = False):
    """Agree the deal, open its escrow and lock the funds if the wallet covers them.

    ``approved``: the seller approved this purchase from the approval queue, so
    the mandate's order and daily limits don't apply."""
    from . import escrow as escrow_svc
    if neg.status == "agreed":
        return escrow_svc.create_for_negotiation(db, neg, user_id)  # idempotent
    if neg.status != "offer_received" or not neg.latest_supplier_price:
        raise ApiError(409, "no_offer", "There is no supplier offer to accept yet.")
    mandate = get_mandate(db, neg.business_id)
    total = neg.latest_supplier_price * neg.quantity
    if mandate.agents_paused:
        raise ApiError(403, "agents_paused", "All agents are paused. Resume EcomMind before confirming deals.")
    if total > mandate.max_order_value and not approved:
        raise ApiError(403, "mandate_max_order_value",
                       f"Order value {inr(total)} is above your mandate's {inr(mandate.max_order_value)} per-order limit. "
                       "Raise the limit in Settings or reduce the quantity.")
    remaining = mandate.daily_budget - budget_consumed_today(db, neg.business_id)
    if total > remaining and not approved:
        raise ApiError(403, "mandate_daily_budget",
                       f"Order value {inr(total)} is above today's remaining mandate budget of {inr(max(0, remaining))}.")
    neg.agreed_unit_price = neg.latest_supplier_price
    neg.status = "agreed"
    rfq = db.get(RFQ, neg.rfq_id)
    rfq.status = "agreed"
    supplier = db.get(Supplier, neg.supplier_id)
    log_activity(db, neg.business_id, agent="EcomMind", action=f"Deal agreed with {supplier.name.split('—')[0].strip()}",
                 product=rfq.product_name, amount=total, status="success",
                 detail=f"{neg.quantity} units at {inr(neg.agreed_unit_price)} · {rfq.id} / {neg.id}", ref=neg.id)
    esc = escrow_svc.create_for_negotiation(db, neg, user_id)
    locked = escrow_svc.lock(db, esc, raise_on_block=False, approved=approved)
    if locked:
        note = f"{inr(total)} is now locked in escrow {esc.id} and is paid to the supplier only after you confirm delivery."
    else:
        note = f"Escrow {esc.id} is open but no money has moved: {esc.status_note}"
    _msg(db, neg, "seller", "accept",
         f"Deal confirmed at {inr(neg.agreed_unit_price)} per unit · total {inr(total)}. {note}", neg.agreed_unit_price)
    return esc


def request_accept(db: Session, neg: Negotiation, user_id: int, agent_name: str = "EcomMind"):
    """Accept within the mandate, or send the purchase to the approval queue.

    Returns ("accepted", Escrow) or ("queued", Approval)."""
    from . import approvals
    try:
        return "accepted", accept_offer(db, neg, user_id)
    except ApiError as e:
        if e.code not in ("mandate_max_order_value", "mandate_daily_budget"):
            raise
        if not get_mandate(db, neg.business_id).approval_above_limit:
            raise
        rfq = db.get(RFQ, neg.rfq_id)
        total = (neg.latest_supplier_price or 0) * neg.quantity
        a = approvals.queue(
            db, neg.business_id, action_type="purchase", agent_name=agent_name,
            title=f"Buy {neg.quantity} × {rfq.product_name} from {rfq.supplier_name.split('—')[0].strip()} for {inr(total)}",
            description=f"{e.message} Approving confirms the deal at {inr(neg.latest_supplier_price)} per unit, opens an escrow and locks the funds.",
            reasons=[e.code], financial_impact=-total,
            payload={"negotiationId": neg.id, "unitPrice": neg.latest_supplier_price, "quantity": neg.quantity, "total": total},
            dedupe_key=f"purchase:{neg.id}")
        _msg(db, neg, "system", "info", f"This deal is above your mandate limits and is waiting for your approval ({a.id}).")
        return "queued", a


def cancel(db: Session, neg: Negotiation) -> None:
    if neg.status in {"agreed"}:
        raise ApiError(409, "negotiation_closed", "An agreed deal can't be cancelled here.")
    neg.status = "cancelled"
    db.get(RFQ, neg.rfq_id).status = "cancelled"
    _msg(db, neg, "seller", "info", "Negotiation cancelled by the seller.")


def create_rfq(db: Session, business_id: int, user_id: int, *, supplier_id: str, sku: str, quantity: int,
               target_unit_price: Optional[int], delivery_location: str, delivery_days: int, idempotency_key: str,
               requested_by: str = "EcomMind") -> tuple[RFQ, Negotiation, bool]:
    """Send a quotation request and open its negotiation (used by the API, approvals and the agent)."""
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    from ..models import NegotiationMessage, Product
    from ..security import new_id

    existing = db.scalar(select(RFQ).where(RFQ.user_id == user_id, RFQ.idempotency_key == idempotency_key))
    if existing:
        return existing, db.scalar(select(Negotiation).where(Negotiation.rfq_id == existing.id)), True
    supplier = db.get(Supplier, supplier_id)
    if not supplier or (supplier.business_id is not None and supplier.business_id != business_id):
        raise ApiError(404, "supplier_not_found", "That supplier doesn't exist.", field="supplierId")
    sku = sku.upper()
    product = db.scalar(select(Product).where(Product.business_id == business_id, Product.sku == sku))
    if not product:
        raise ApiError(422, "product_not_found", f"{sku} isn't in your catalogue.", field="sku")
    if quantity < 1:
        raise ApiError(422, "invalid_quantity", "Quantity must be at least 1.", field="quantity")
    if target_unit_price and target_unit_price * quantity > 10**12:
        raise ApiError(422, "invalid_target", "Target price is too large.", field="targetUnitPrice")

    rfq = RFQ(id=new_id("RFQ"), business_id=business_id, user_id=user_id, supplier_id=supplier.id, supplier_name=supplier.name,
              sku=sku, product_name=product.name, quantity=quantity, target_unit_price=target_unit_price,
              delivery_location=delivery_location.strip(), delivery_days=delivery_days,
              status="quotation_requested", idempotency_key=idempotency_key)
    neg = Negotiation(id=new_id("NEG"), rfq_id=rfq.id, business_id=business_id, supplier_id=supplier.id, sku=sku,
                      quantity=quantity, status="quotation_requested")
    db.add(rfq)
    try:
        db.flush()  # the RFQ row must exist before the negotiation that references it
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "duplicate_request", "This quotation request was already submitted.")
    db.add(neg)
    db.flush()
    target = f" Target price {inr(target_unit_price)} per unit." if target_unit_price else ""
    db.add(NegotiationMessage(negotiation_id=neg.id, sender="ecommind", kind="rfq",
                              text=f"Requesting {quantity} units of {product.name} ({sku}), delivery to "
                                   f"{rfq.delivery_location} within {delivery_days} days.{target}"))
    supplier_receive_rfq(db, neg, rfq, supplier)
    if neg.status == "offer_received":
        ecommind_auto_counter(db, neg, rfq, supplier)
    log_activity(db, business_id, agent=requested_by, action=f"RFQ sent to {supplier.name.split('—')[0].strip()}", product=product.name,
                 status="info", detail=f"{quantity} units requested · {rfq.id}", ref=neg.id)
    return rfq, neg, False
