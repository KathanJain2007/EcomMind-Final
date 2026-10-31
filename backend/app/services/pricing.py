"""Repricing: the only way a product's selling price changes.

Each request is checked against the seller's mandate:
  * gross margin at the new price >= min_gross_margin_pct
  * |change| <= max_price_change_pct (festival markdowns use max_discount_pct instead)
  * a markdown never exceeds max_discount_pct
and, for agent-initiated changes, the pricing mode must be "autonomous".

Changes that pass are applied in the same transaction that writes the
price_changes history row and the activity event. Changes that don't are
refused with the safeguard results so they can go to the seller for approval;
an explicit seller approval (``approved=True``) applies them and is recorded
as an override.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import Mandate, PriceChange, Product
from ..security import new_id
from .ledger import get_mandate, log_activity

SOURCES = ("seller", "agent", "festival", "approval")
MODES = ("manual", "recommendation", "autonomous")


def inr(paise: int) -> str:
    r = paise / 100
    return f"₹{r:,.0f}" if r == int(r) else f"₹{r:,.2f}"


def gross_margin_pct(price: int, cost: int) -> float:
    return round((price - cost) / price * 100, 1) if price > 0 else -100.0


@dataclass
class Evaluation:
    old_price: int
    new_price: int
    pct_change: float
    margin_pct: float
    min_margin_met: bool
    max_change_met: bool
    max_discount_met: bool
    mode_allows: bool
    band_pct: float

    @property
    def violations(self) -> list[str]:
        out = []
        if not self.min_margin_met:
            out.append("min_margin")
        if not self.max_change_met:
            out.append("max_change")
        if not self.max_discount_met:
            out.append("max_discount")
        if not self.mode_allows:
            out.append("pricing_mode")
        return out

    def safeguards(self, m: Mandate) -> dict:
        return {"minMarginMet": self.min_margin_met, "maxChangeMet": self.max_change_met,
                "maxDiscountMet": self.max_discount_met, "modeAllows": self.mode_allows,
                "marginPct": self.margin_pct, "pctChange": self.pct_change,
                "minGrossMarginPct": m.min_gross_margin_pct, "allowedChangePct": self.band_pct,
                "maxDiscountPct": m.max_discount_pct, "pricingMode": m.pricing_mode}


def evaluate(p: Product, new_price: int, m: Mandate, source: str) -> Evaluation:
    pct = round((new_price - p.price) / p.price * 100, 1) if p.price else 100.0
    margin = gross_margin_pct(new_price, p.cost)
    band = m.max_discount_pct if source == "festival" else m.max_price_change_pct
    discount = max(0.0, -pct)
    return Evaluation(
        old_price=p.price, new_price=new_price, pct_change=pct, margin_pct=margin,
        min_margin_met=margin >= m.min_gross_margin_pct,
        max_change_met=abs(pct) <= band,
        max_discount_met=discount <= m.max_discount_pct,
        mode_allows=source != "agent" or m.pricing_mode == "autonomous",
        band_pct=band,
    )


def _explain(ev: Evaluation, m: Mandate) -> str:
    parts = []
    if not ev.min_margin_met:
        parts.append(f"gross margin would be {ev.margin_pct}% (floor {m.min_gross_margin_pct:g}%)")
    if not ev.max_change_met:
        parts.append(f"a {ev.pct_change:+g}% move is outside the ±{ev.band_pct:g}% band")
    if not ev.max_discount_met:
        parts.append(f"a {-ev.pct_change:g}% markdown is above the {m.max_discount_pct:g}% discount cap")
    if not ev.mode_allows:
        parts.append(f"pricing mode is {m.pricing_mode}, so agent price changes need your approval")
    return "; ".join(parts)


def get_product(db: Session, business_id: int, sku: str) -> Product:
    p = db.scalar(select(Product).where(Product.business_id == business_id, Product.sku == sku.upper()))
    if not p:
        raise ApiError(404, "product_not_found", f"{sku.upper()} isn't in your catalogue.", field="sku")
    return p


def _validate_price(new_price: int, p: Product) -> None:
    if new_price <= 0:
        raise ApiError(422, "invalid_price", "Enter a price greater than zero.", field="newPrice")
    if new_price > p.price * 10 and new_price > 10_000_000_00:
        raise ApiError(422, "invalid_price", "That price is unrealistically high.", field="newPrice")


def apply(db: Session, p: Product, ev: Evaluation, m: Mandate, *, reason: str, source: str, actor: str,
          user_id: Optional[int], override: bool, ref: Optional[str] = None) -> PriceChange:
    # Compare-and-set on the price we evaluated, so two concurrent changes can't
    # both be computed from the same old price.
    res = db.execute(update(Product).where(Product.id == p.id, Product.price == ev.old_price).values(price=ev.new_price))
    if res.rowcount != 1:
        raise ApiError(409, "price_changed", "The price changed while this request was processing. Review it and try again.")
    db.refresh(p)
    pc = PriceChange(id=new_id("PRC"), business_id=p.business_id, sku=p.sku, product_name=p.name, old_price=ev.old_price,
                     new_price=ev.new_price, pct_change=ev.pct_change, margin_pct=ev.margin_pct, reason=reason[:300],
                     source=source, actor=actor[:80], user_id=user_id, seller_override=override, safeguards=ev.safeguards(m), ref=ref)
    db.add(pc)
    log_activity(db, p.business_id, agent=actor[:80],
                 action=f"Repriced {p.name}: {inr(ev.old_price)} → {inr(ev.new_price)} ({ev.pct_change:+g}%)",
                 product=p.name, status="warning" if override else "success",
                 detail=f"{reason} · gross margin {ev.margin_pct}%" + (" · approved by seller outside mandate limits" if override else ""),
                 ref=pc.id)
    return pc


def change_price(db: Session, business_id: int, sku: str, new_price: int, *, reason: str, source: str, actor: str,
                 user_id: Optional[int], approved: bool = False, expected_price: Optional[int] = None,
                 ref: Optional[str] = None) -> PriceChange:
    if source not in SOURCES:
        raise ApiError(422, "invalid_source", "Unknown price change source.", field="source")
    p = get_product(db, business_id, sku)
    _validate_price(new_price, p)
    if expected_price is not None and expected_price != p.price:
        raise ApiError(409, "price_changed", f"{p.name} is now {inr(p.price)}, not {inr(expected_price)}. Review the change again.",
                       details={"currentPrice": p.price})
    if new_price == p.price:
        raise ApiError(422, "no_change", f"{p.name} is already {inr(p.price)}.", field="newPrice")
    m = get_mandate(db, business_id)
    if source == "agent" and m.agents_paused:
        raise ApiError(403, "agents_paused", "All agents are paused. Resume EcomMind before agents change prices.")
    ev = evaluate(p, new_price, m, source)
    if ev.violations and not approved:
        raise ApiError(409, "needs_approval", f"{p.name}: {_explain(ev, m)}. This change needs your approval.",
                       details={"sku": p.sku, "productName": p.name, "oldPrice": p.price, "newPrice": new_price,
                                "violations": ev.violations, "safeguards": ev.safeguards(m),
                                "monthlyImpact": round((new_price - p.price) * p.avg_daily_sales * 30)})
    return apply(db, p, ev, m, reason=reason, source=source, actor=actor, user_id=user_id,
                 override=bool(ev.violations), ref=ref)


def out(pc: PriceChange) -> dict:
    return {"id": pc.id, "sku": pc.sku, "productName": pc.product_name, "oldPrice": pc.old_price, "newPrice": pc.new_price,
            "pctChange": pc.pct_change, "marginPct": pc.margin_pct, "reason": pc.reason, "source": pc.source,
            "actor": pc.actor, "sellerOverride": pc.seller_override, "safeguards": pc.safeguards, "ref": pc.ref,
            "createdAt": pc.created_at.isoformat()}
