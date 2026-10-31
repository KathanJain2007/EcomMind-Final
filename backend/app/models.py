"""SQLAlchemy models. Money is stored as integer paise (₹1 = 100)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Stores UTC and always returns timezone-aware datetimes.

    SQLite has no timezone type, so without this a stored time comes back
    naive and serialises without an offset, and browsers then read UTC as
    local time (5.5 hours off in India).
    """
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


# --------------------------------------------------------------------------- accounts

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320))
    # Gmail ignores dots and +tags, so a.b+x@gmail.com and ab@gmail.com are one
    # mailbox. Uniqueness is enforced on this canonical form.
    email_canonical: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    business: Mapped[Optional["Business"]] = relationship(back_populates="owner", uselist=False, cascade="all, delete-orphan")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[Optional[str]] = mapped_column(String(80))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    channel: Mapped[Optional[str]] = mapped_column(String(40))
    business_type: Mapped[Optional[str]] = mapped_column(String(60))
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    demo_loaded: Mapped[bool] = mapped_column(Boolean, default=False)
    agent_status: Mapped[str] = mapped_column(String(12), default="active")
    plan: Mapped[str] = mapped_column(String(40), default="Growth Plan")

    # Business location (from Google Places when verified)
    location_text: Mapped[Optional[str]] = mapped_column(String(300))
    location_place_id: Mapped[Optional[str]] = mapped_column(String(300))
    location_lat: Mapped[Optional[float]] = mapped_column(Float)
    location_lng: Mapped[Optional[float]] = mapped_column(Float)
    location_city: Mapped[Optional[str]] = mapped_column(String(120))
    location_state: Mapped[Optional[str]] = mapped_column(String(120))
    location_country: Mapped[Optional[str]] = mapped_column(String(120))
    location_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # GSTIN — format-validated only (no official GST portal check is integrated).
    gstin: Mapped[Optional[str]] = mapped_column(String(15), unique=True)
    gstin_status: Mapped[Optional[str]] = mapped_column(String(32))  # "format_validated"
    gstin_updated_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())

    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="business")


# --------------------------------------------------------------------------- catalogue + sales

class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("business_id", "sku"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80))
    price: Mapped[int] = mapped_column(Integer)  # paise
    cost: Mapped[int] = mapped_column(Integer)  # paise
    stock: Mapped[int] = mapped_column(Integer)
    avg_daily_sales: Mapped[float] = mapped_column(Float)
    return_rate: Mapped[float] = mapped_column(Float, default=0.05)
    icon: Mapped[str] = mapped_column(String(40), default="package")
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class SalesDaily(Base):
    __tablename__ = "sales_daily"
    __table_args__ = (UniqueConstraint("business_id", "day", "sku"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    sku: Mapped[str] = mapped_column(String(40))
    units: Mapped[int] = mapped_column(Integer)
    orders: Mapped[int] = mapped_column(Integer)
    revenue: Mapped[int] = mapped_column(Integer)  # paise


class ReturnStat(Base):
    __tablename__ = "return_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    pincode: Mapped[str] = mapped_column(String(10))
    city: Mapped[str] = mapped_column(String(80))
    sku: Mapped[str] = mapped_column(String(40))
    orders: Mapped[int] = mapped_column(Integer)
    returns: Mapped[int] = mapped_column(Integer)


class CompetitorPrice(Base):
    __tablename__ = "competitor_prices"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(40))
    channel: Mapped[str] = mapped_column(String(40))
    price: Mapped[int] = mapped_column(Integer)  # paise


# --------------------------------------------------------------------------- network (shared)

class LogisticsQuote(Base):
    __tablename__ = "logistics_quotes"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    courier: Mapped[str] = mapped_column(String(60))
    service: Mapped[str] = mapped_column(String(60))
    cost_per_500g: Mapped[int] = mapped_column(Integer)  # paise
    eta_days: Mapped[int] = mapped_column(Integer)
    rating: Mapped[float] = mapped_column(Float)
    cod: Mapped[bool] = mapped_column(Boolean)


class ServiceAgent(Base):
    __tablename__ = "service_agents"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(20))
    operation: Mapped[str] = mapped_column(String(40))
    price_per_call: Mapped[int] = mapped_column(Integer)  # paise
    unit: Mapped[str] = mapped_column(String(40))
    rating: Mapped[float] = mapped_column(Float)
    # Authoritative, network-wide count of successful executions.
    calls_served: Mapped[int] = mapped_column(Integer, default=0)
    availability: Mapped[str] = mapped_column(String(12), default="Online")
    latency: Mapped[str] = mapped_column(String(20))
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(40))


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    agent_id: Mapped[str] = mapped_column(String(40))
    location: Mapped[str] = mapped_column(String(80))
    rating: Mapped[float] = mapped_column(Float)
    reviews: Mapped[int] = mapped_column(Integer)
    verified: Mapped[bool] = mapped_column(Boolean)
    # True when the supplier agent answers RFQs automatically. Otherwise an RFQ
    # waits in "awaiting supplier response" until a real reply arrives.
    auto_respond: Mapped[bool] = mapped_column(Boolean, default=True)


class SupplierQuote(Base):
    __tablename__ = "supplier_quotes"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"), index=True)
    sku: Mapped[str] = mapped_column(String(40))
    unit_price: Mapped[int] = mapped_column(Integer)  # paise
    floor_price: Mapped[int] = mapped_column(Integer)  # paise, private to the supplier agent
    delivery_days: Mapped[int] = mapped_column(Integer)
    moq: Mapped[int] = mapped_column(Integer)
    available: Mapped[int] = mapped_column(Integer)
    valid_till: Mapped[date] = mapped_column(Date)


# --------------------------------------------------------------------------- money + agents

class Mandate(Base):
    __tablename__ = "mandates"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True)
    daily_budget: Mapped[int] = mapped_column(Integer, default=75_000_00)
    max_order_value: Mapped[int] = mapped_column(Integer, default=60_000_00)
    max_per_call_cost: Mapped[int] = mapped_column(Integer, default=10_00)
    wallet_daily_limit: Mapped[int] = mapped_column(Integer, default=1_000_00)
    max_price_change_pct: Mapped[float] = mapped_column(Float, default=10)
    min_gross_margin_pct: Mapped[float] = mapped_column(Float, default=15)
    auto_pause_return_pct: Mapped[float] = mapped_column(Float, default=25)
    auto_purchasing: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_negotiation: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_repricing: Mapped[bool] = mapped_column(Boolean, default=False)
    approval_above_limit: Mapped[bool] = mapped_column(Boolean, default=True)
    agents_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    # Repricing policy. pricing_mode: manual | recommendation | autonomous
    # (auto_repricing is kept equal to pricing_mode == "autonomous").
    max_discount_pct: Mapped[float] = mapped_column(Float, default=25)
    pricing_mode: Mapped[str] = mapped_column(String(16), default="recommendation")
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class WalletTxn(Base):
    __tablename__ = "wallet_txns"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    time: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    counterparty: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(24))  # service_call | topup | logistics | escrow_lock | escrow_release | refund
    amount: Mapped[int] = mapped_column(Integer)  # paise, negative = debit
    status: Mapped[str] = mapped_column(String(16))
    signature: Mapped[str] = mapped_column(String(80))
    memo: Mapped[str] = mapped_column(String(300))
    ref: Mapped[Optional[str]] = mapped_column(String(40))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(80))
    # Money moved by this entry when it differs from the wallet effect, e.g. an
    # escrow release pays the supplier from escrow (wallet effect 0).
    gross_amount: Mapped[Optional[int]] = mapped_column(Integer)


class Escrow(Base):
    """Funds held for one agreed negotiation until delivery.

    pending -> locked -> dispatched -> delivered -> released
    pending -> cancelled;  locked | dispatched -> refunded
    """
    __tablename__ = "escrows"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    negotiation_id: Mapped[str] = mapped_column(ForeignKey("negotiations.id", ondelete="CASCADE"), unique=True)
    rfq_id: Mapped[str] = mapped_column(String(40))
    buyer_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"))
    supplier_name: Mapped[str] = mapped_column(String(120))
    sku: Mapped[str] = mapped_column(String(40))
    product_name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)  # paise
    amount: Mapped[int] = mapped_column(Integer)  # paise
    status: Mapped[str] = mapped_column(String(16), index=True)
    status_note: Mapped[Optional[str]] = mapped_column(String(300))
    courier: Mapped[Optional[str]] = mapped_column(String(80))
    tracking_id: Mapped[Optional[str]] = mapped_column(String(80))
    refund_reason: Mapped[Optional[str]] = mapped_column(String(300))
    lock_txn_id: Mapped[Optional[str]] = mapped_column(String(40))
    settle_txn_id: Mapped[Optional[str]] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    locked_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    delivered_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    released_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    refunded_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())


class PriceChange(Base):
    """Every applied change to a product's selling price."""
    __tablename__ = "price_changes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(40), index=True)
    product_name: Mapped[str] = mapped_column(String(160))
    old_price: Mapped[int] = mapped_column(Integer)  # paise
    new_price: Mapped[int] = mapped_column(Integer)  # paise
    pct_change: Mapped[float] = mapped_column(Float)
    margin_pct: Mapped[float] = mapped_column(Float)  # gross margin at the new price
    reason: Mapped[str] = mapped_column(String(300))
    source: Mapped[str] = mapped_column(String(16))  # seller | agent | festival | approval
    actor: Mapped[str] = mapped_column(String(80))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    seller_override: Mapped[bool] = mapped_column(Boolean, default=False)  # applied outside the mandate with explicit approval
    safeguards: Mapped[dict] = mapped_column(JSON)
    ref: Mapped[Optional[str]] = mapped_column(String(40))  # campaign / approval that caused it
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)


class MarketplaceListing(Base):
    """A product offered on a sales channel. Price and stock always come from
    the product, so every channel sells from one stock pool at one price."""
    __tablename__ = "marketplace_listings"
    __table_args__ = (UniqueConstraint("business_id", "channel", "sku"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20))
    sku: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    mrp: Mapped[Optional[int]] = mapped_column(Integer)  # paise
    status: Mapped[str] = mapped_column(String(12), default="active")  # active | paused
    external_listing_id: Mapped[Optional[str]] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class MarketplaceOrder(Base):
    """A customer order on a sales channel. Stock is taken when it is created."""
    __tablename__ = "marketplace_orders"
    __table_args__ = (UniqueConstraint("business_id", "idempotency_key"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20), index=True)
    listing_id: Mapped[str] = mapped_column(String(40))
    sku: Mapped[str] = mapped_column(String(40), index=True)
    product_name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)  # paise, the product price when ordered
    unit_cost: Mapped[int] = mapped_column(Integer)
    gross_amount: Mapped[int] = mapped_column(Integer)
    commission: Mapped[int] = mapped_column(Integer)
    shipping_cost: Mapped[int] = mapped_column(Integer)
    packaging_cost: Mapped[int] = mapped_column(Integer)
    tax_amount: Mapped[int] = mapped_column(Integer)  # GST included in the price
    net_profit: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), index=True)  # confirmed | dispatched | delivered | cancelled | returned
    sale_day: Mapped[date] = mapped_column(Date)  # India date the sale was counted in sales_daily
    customer_city: Mapped[Optional[str]] = mapped_column(String(80))
    customer_state: Mapped[Optional[str]] = mapped_column(String(80))
    customer_pincode: Mapped[Optional[str]] = mapped_column(String(10))
    external_order_id: Mapped[Optional[str]] = mapped_column(String(80))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    delivered_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())
    returned_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())


class StockMovement(Base):
    """Every change to a product's stock, with what caused it."""
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(40), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    resulting_stock: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(24))  # restock_receipt | sale | adjustment | import | return
    channel: Mapped[Optional[str]] = mapped_column(String(40))
    reason: Mapped[str] = mapped_column(String(300))
    ref: Mapped[Optional[str]] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)


class AgentCall(Base):
    __tablename__ = "agent_calls"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("service_agents.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    operation: Mapped[str] = mapped_column(String(40))
    sku: Mapped[Optional[str]] = mapped_column(String(40))
    product_name: Mapped[Optional[str]] = mapped_column(String(160))
    # pending | success | failed | rejected | timed_out
    status: Mapped[str] = mapped_column(String(16), index=True)
    cost: Mapped[int] = mapped_column(Integer)  # paise; charged only when status == success
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(80))
    error_code: Mapped[Optional[str]] = mapped_column(String(60))
    error_message: Mapped[Optional[str]] = mapped_column(String(300))
    result: Mapped[Optional[dict]] = mapped_column(JSON)
    txn_id: Mapped[Optional[str]] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime())


# --------------------------------------------------------------------------- RFQ + negotiation

class RFQ(Base):
    __tablename__ = "rfqs"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"))
    supplier_name: Mapped[str] = mapped_column(String(120))
    sku: Mapped[str] = mapped_column(String(40))
    product_name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[int] = mapped_column(Integer)
    target_unit_price: Mapped[Optional[int]] = mapped_column(Integer)  # paise
    delivery_location: Mapped[str] = mapped_column(String(300))
    delivery_days: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32))
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Negotiation(Base):
    __tablename__ = "negotiations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    rfq_id: Mapped[str] = mapped_column(ForeignKey("rfqs.id", ondelete="CASCADE"), unique=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"))
    sku: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[int] = mapped_column(Integer)
    # quotation_requested | awaiting_supplier_response | negotiation_in_progress |
    # offer_received | agreed | declined | cancelled
    status: Mapped[str] = mapped_column(String(32))
    latest_supplier_price: Mapped[Optional[int]] = mapped_column(Integer)
    latest_buyer_price: Mapped[Optional[int]] = mapped_column(Integer)
    agreed_unit_price: Mapped[Optional[int]] = mapped_column(Integer)
    supplier_delivery_days: Mapped[Optional[int]] = mapped_column(Integer)
    rounds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    messages: Mapped[list["NegotiationMessage"]] = relationship(order_by="NegotiationMessage.id", cascade="all, delete-orphan")


class NegotiationMessage(Base):
    __tablename__ = "negotiation_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    negotiation_id: Mapped[str] = mapped_column(ForeignKey("negotiations.id", ondelete="CASCADE"), index=True)
    sender: Mapped[str] = mapped_column(String(16))  # ecommind | seller | supplier | system
    kind: Mapped[str] = mapped_column(String(20))  # rfq | offer | counter | accept | decline | info
    unit_price: Mapped[Optional[int]] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


# --------------------------------------------------------------------------- activity

class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"), index=True)
    time: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    agent: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(200))
    product: Mapped[Optional[str]] = mapped_column(String(160))
    amount: Mapped[Optional[int]] = mapped_column(Integer)  # paise
    status: Mapped[str] = mapped_column(String(12))  # success | info | warning | pending
    detail: Mapped[Optional[str]] = mapped_column(Text)
    ref: Mapped[Optional[str]] = mapped_column(String(40))


class SchemaVersion(Base):
    __tablename__ = "schema_version"

    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
