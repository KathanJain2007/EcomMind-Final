"""Escrow: funds held for an agreed deal until the goods arrive.

Every state change is a compare-and-set UPDATE (``WHERE status = <expected>``)
inside a BEGIN IMMEDIATE transaction, so two concurrent clicks can't both
release or refund. A unique index on (ref, kind) in wallet_txns backs this up
at the database level.

Ledger effects (WalletTxn.amount is the effect on the seller's available balance):
  lock     -amount  kind=escrow_lock     funds leave the wallet into escrow
  release        0  kind=escrow_release  escrow pays the supplier (gross_amount = amount)
  refund   +amount  kind=refund          escrow returns funds to the wallet
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import RFQ, Escrow, Negotiation, Product, StockMovement, Supplier, WalletTxn
from ..security import new_id, sign
from .ledger import budget_consumed_today, get_mandate, log_activity, wallet_balance

ACTIVE = ("locked", "dispatched", "delivered")
LABELS = {
    "pending": "Awaiting funds", "locked": "Money locked", "dispatched": "Goods dispatched",
    "delivered": "Delivery confirmed", "released": "Payment released", "refunded": "Refunded", "cancelled": "Cancelled",
}


def inr(paise: int) -> str:
    r = paise / 100
    return f"₹{r:,.0f}" if r == int(r) else f"₹{r:,.2f}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def out(e: Escrow, txns: Optional[list[WalletTxn]] = None) -> dict:
    iso = lambda d: d.isoformat() if d else None  # noqa: E731
    o = {
        "id": e.id, "negotiationId": e.negotiation_id, "rfqId": e.rfq_id, "buyerUserId": e.buyer_user_id,
        "supplierId": e.supplier_id, "supplierName": e.supplier_name, "sku": e.sku, "productName": e.product_name,
        "quantity": e.quantity, "unitPrice": e.unit_price, "amount": e.amount,
        "status": e.status, "statusLabel": LABELS.get(e.status, e.status), "statusNote": e.status_note,
        "courier": e.courier, "trackingId": e.tracking_id, "refundReason": e.refund_reason,
        "createdAt": iso(e.created_at), "lockedAt": iso(e.locked_at), "dispatchedAt": iso(e.dispatched_at),
        "deliveredAt": iso(e.delivered_at), "releasedAt": iso(e.released_at), "refundedAt": iso(e.refunded_at),
        "cancelledAt": iso(e.cancelled_at),
    }
    if txns is not None:
        o["ledger"] = [{"id": t.id, "time": iso(t.time), "kind": t.kind, "amount": t.amount,
                        "grossAmount": t.gross_amount, "status": t.status, "memo": t.memo, "signature": t.signature}
                       for t in txns]
    return o


def get_owned(db: Session, business_id: int, escrow_id: str) -> Escrow:
    e = db.get(Escrow, escrow_id)
    if not e or e.business_id != business_id:
        raise ApiError(404, "escrow_not_found", "Escrow not found.")
    return e


def _cas(db: Session, e: Escrow, expected: tuple, **values) -> bool:
    """Move the escrow only if it is still in an expected status."""
    res = db.execute(update(Escrow).where(Escrow.id == e.id, Escrow.status.in_(expected)).values(**values))
    if res.rowcount != 1:
        return False
    db.refresh(e)
    return True


def create_for_negotiation(db: Session, neg: Negotiation, user_id: int) -> Escrow:
    """One escrow per agreed negotiation (unique negotiation_id)."""
    existing = db.scalar(select(Escrow).where(Escrow.negotiation_id == neg.id))
    if existing:
        return existing
    rfq = db.get(RFQ, neg.rfq_id)
    supplier = db.get(Supplier, neg.supplier_id)
    e = Escrow(id=new_id("ESC"), business_id=neg.business_id, negotiation_id=neg.id, rfq_id=rfq.id,
               buyer_user_id=user_id, supplier_id=supplier.id, supplier_name=supplier.name, sku=neg.sku,
               product_name=rfq.product_name, quantity=neg.quantity, unit_price=neg.agreed_unit_price,
               amount=neg.agreed_unit_price * neg.quantity, status="pending")
    db.add(e)
    db.flush()
    return e


def check_lock_allowed(db: Session, e: Escrow) -> Optional[tuple[int, str, str]]:
    """Return (http status, code, message) if funds can't be locked now."""
    m = get_mandate(db, e.business_id)
    if m.agents_paused:
        return 403, "agents_paused", "All agents are paused. Resume EcomMind before locking funds."
    if e.amount > m.max_order_value:
        return 403, "mandate_max_order_value", f"{inr(e.amount)} is above your mandate's {inr(m.max_order_value)} per-order limit."
    remaining = m.daily_budget - budget_consumed_today(db, e.business_id)
    if e.amount > remaining:
        return 403, "mandate_daily_budget", f"{inr(e.amount)} is above today's remaining mandate budget of {inr(max(0, remaining))}."
    balance = wallet_balance(db, e.business_id)
    if balance < e.amount:
        return 402, "insufficient_balance", f"Wallet balance {inr(balance)} is short of {inr(e.amount)}. Top up {inr(e.amount - balance)} to lock funds."
    return None


def lock(db: Session, e: Escrow, *, raise_on_block: bool = True) -> bool:
    if e.status in ACTIVE or e.status == "released":
        return True  # already locked or beyond: idempotent
    if e.status != "pending":
        raise ApiError(409, "escrow_closed", f"This escrow is {LABELS[e.status].lower()}.")
    blocked = check_lock_allowed(db, e)
    if blocked:
        e.status_note = blocked[2]
        if raise_on_block:
            raise ApiError(*blocked, details={"escrowId": e.id})
        return False
    txn_id, now = new_id("TXN"), _now()
    if not _cas(db, e, ("pending",), status="locked", locked_at=now, lock_txn_id=txn_id, status_note=None):
        db.refresh(e)
        return e.status != "pending"
    db.add(WalletTxn(id=txn_id, business_id=e.business_id, time=now, counterparty=f"Escrow — {e.supplier_name.split('—')[0].strip()}",
                     kind="escrow_lock", amount=-e.amount, gross_amount=e.amount, status="Locked",
                     signature=sign(txn_id, e.id, -e.amount, now.isoformat()),
                     memo=f"{e.quantity} × {e.product_name} @ {inr(e.unit_price)} · {e.id}", ref=e.id))
    log_activity(db, e.business_id, agent="EcomMind", action=f"{inr(e.amount)} locked in escrow",
                 product=e.product_name, amount=e.amount, status="pending",
                 detail=f"{e.id} · {e.quantity} units from {e.supplier_name} · released only after delivery", ref=e.id)
    return True


def dispatch(db: Session, e: Escrow, courier: Optional[str], tracking_id: Optional[str]) -> None:
    if e.status == "dispatched":
        return
    if not _cas(db, e, ("locked",), status="dispatched", dispatched_at=_now(), courier=courier, tracking_id=tracking_id):
        raise ApiError(409, "invalid_transition", f"Only escrows with money locked can be dispatched (this one is {LABELS[e.status].lower()}).")
    log_activity(db, e.business_id, agent=e.supplier_name.split("—")[0].strip(), action="Goods dispatched",
                 product=e.product_name, status="info",
                 detail=f"{e.id} · {courier or 'courier not given'}{f' · tracking {tracking_id}' if tracking_id else ''}", ref=e.id)


def confirm_delivery(db: Session, e: Escrow) -> None:
    if e.status == "delivered":
        return
    if not _cas(db, e, ("dispatched",), status="delivered", delivered_at=_now()):
        raise ApiError(409, "invalid_transition", f"Delivery can only be confirmed after dispatch (this escrow is {LABELS[e.status].lower()}).")
    # Goods received: stock goes up, with a movement record.
    product = db.scalar(select(Product).where(Product.business_id == e.business_id, Product.sku == e.sku))
    if product:
        db.execute(update(Product).where(Product.id == product.id).values(stock=Product.stock + e.quantity))
        db.refresh(product)
        db.add(StockMovement(business_id=e.business_id, sku=e.sku, delta=e.quantity, resulting_stock=product.stock,
                             kind="restock_receipt", channel="supplier", reason=f"Delivery received from {e.supplier_name}", ref=e.id))
    log_activity(db, e.business_id, agent="Seller", action="Delivery confirmed", product=e.product_name, status="success",
                 detail=f"{e.id} · {e.quantity} units added to stock", ref=e.id)


def release(db: Session, e: Escrow) -> None:
    if e.status == "released":
        return
    txn_id, now = new_id("TXN"), _now()
    if not _cas(db, e, ("delivered",), status="released", released_at=now, settle_txn_id=txn_id):
        raise ApiError(409, "invalid_transition", f"Payment can only be released after delivery is confirmed (this escrow is {LABELS[e.status].lower()}).")
    db.add(WalletTxn(id=txn_id, business_id=e.business_id, time=now, counterparty=e.supplier_name, kind="escrow_release",
                     amount=0, gross_amount=e.amount, status="Released",
                     signature=sign(txn_id, e.id, e.amount, now.isoformat()),
                     memo=f"{inr(e.amount)} paid from escrow {e.id} to the supplier", ref=e.id))
    db.execute(update(WalletTxn).where(WalletTxn.id == e.lock_txn_id).values(status="Released"))
    log_activity(db, e.business_id, agent="EcomMind", action=f"{inr(e.amount)} released to {e.supplier_name.split('—')[0].strip()}",
                 product=e.product_name, amount=e.amount, status="success", detail=f"{e.id} · delivery confirmed", ref=e.id)


def refund(db: Session, e: Escrow, reason: str) -> None:
    if e.status == "refunded":
        return
    txn_id, now = new_id("TXN"), _now()
    if not _cas(db, e, ("locked", "dispatched"), status="refunded", refunded_at=now, settle_txn_id=txn_id, refund_reason=reason):
        raise ApiError(409, "invalid_transition",
                       "Only escrows with money locked or goods in transit can be refunded "
                       f"(this one is {LABELS[e.status].lower()}).")
    db.add(WalletTxn(id=txn_id, business_id=e.business_id, time=now, counterparty=f"Escrow — {e.supplier_name.split('—')[0].strip()}",
                     kind="refund", amount=e.amount, gross_amount=e.amount, status="Refunded",
                     signature=sign(txn_id, e.id, e.amount, now.isoformat()), memo=f"Escrow {e.id} refunded · {reason}", ref=e.id))
    db.execute(update(WalletTxn).where(WalletTxn.id == e.lock_txn_id).values(status="Refunded"))
    log_activity(db, e.business_id, agent="EcomMind", action=f"{inr(e.amount)} refunded from escrow",
                 product=e.product_name, amount=e.amount, status="warning", detail=f"{e.id} · {reason}", ref=e.id)


def cancel(db: Session, e: Escrow) -> None:
    if e.status == "cancelled":
        return
    if not _cas(db, e, ("pending",), status="cancelled", cancelled_at=_now()):
        raise ApiError(409, "invalid_transition", "Only escrows still awaiting funds can be cancelled; refund a locked escrow instead.")
    log_activity(db, e.business_id, agent="Seller", action="Escrow cancelled before funding", product=e.product_name,
                 status="info", detail=e.id, ref=e.id)
