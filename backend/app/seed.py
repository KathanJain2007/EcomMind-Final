"""Seed data.

* Network data (service agents, suppliers, quotes, couriers) is shared by every
  seller and inserted once, on first start.
* The demo business (UrbanNest Living) is copied into a seller's own store only
  when they press "Load Demo Business" or use Demo Login. It is clearly demo
  data: deterministic, generated from a fixed random seed, never randomised
  per request.
"""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import (
    RFQ, ActivityEvent, AgentCall, Business, CompetitorPrice, Escrow, LogisticsQuote, Mandate, Negotiation,
    NegotiationMessage, Product, ReturnStat, SalesDaily, ServiceAgent, StockMovement, Supplier, SupplierQuote, User,
    WalletTxn,
)
from .security import new_id, sign

IST = timezone(timedelta(hours=5, minutes=30))


def rupees(x: float) -> int:
    return int(round(x * 100))


SERVICE_AGENTS = [
    dict(id="agent-forecast-01", name="Demand Forecast Agent", type="Compute", operation="demand_forecast", price_per_call=rupees(4), unit="per forecast",
         rating=4.8, calls_served=12840, latency="~900ms", icon="trending-up",
         capabilities=["30-day demand prediction", "Seasonality detection", "Reorder quantity"],
         description="Predicts SKU-level demand for the next 7 and 30 days using your sales history and seasonal signals."),
    dict(id="agent-price-02", name="Market Price Agent", type="Data", operation="market_price", price_per_call=rupees(2), unit="per query",
         rating=4.6, calls_served=22110, latency="~600ms", icon="chart",
         capabilities=["Competitor price tracking", "Suggested price", "Margin impact"],
         description="Scans Amazon, Flipkart and Meesho for competitor pricing and suggests a price within your margin and repricing limits."),
    dict(id="agent-return-03", name="Return Risk Agent", type="Data", operation="return_risk", price_per_call=rupees(1), unit="per score",
         rating=4.5, calls_served=40213, latency="~400ms", icon="shield-alert",
         capabilities=["Pincode RTO risk", "Product return risk", "High-risk regions"],
         description="Scores return and RTO risk by product and pincode so you can act before returns eat your margin."),
    dict(id="agent-logistics-04", name="Logistics Agent", type="Service", operation="logistics_quote", price_per_call=rupees(1), unit="per quote",
         rating=4.7, calls_served=18330, latency="~700ms", icon="truck",
         capabilities=["Courier cost estimates", "Delivery time", "Courier recommendation"],
         description="Compares courier options on cost, speed and COD support, then recommends the best fit per order."),
]

SUPPLIERS = [
    dict(id="SUP-A", name="Supplier A — NovaSource Traders", agent_id="sup-agent-a7", location="Delhi NCR", rating=4.4, reviews=312, verified=True, auto_respond=True),
    dict(id="SUP-B", name="Supplier B — Kedar Electronics", agent_id="sup-agent-b2", location="Mumbai", rating=4.6, reviews=489, verified=True, auto_respond=True),
    dict(id="SUP-C", name="Supplier C — Sona Wholesale", agent_id="sup-agent-c9", location="Surat", rating=4.2, reviews=158, verified=False, auto_respond=True),
]

# (id, supplier, sku, price, floor, days, moq, available, valid_days)
SUPPLIER_QUOTES = [
    ("Q-101", "SUP-A", "EAR-001", 198, 190, 5, 100, 2000, 6),
    ("Q-102", "SUP-B", "EAR-001", 195, 180, 3, 150, 1500, 4),
    ("Q-103", "SUP-C", "EAR-001", 189, 185, 8, 200, 3200, 9),
    ("Q-104", "SUP-B", "LED-005", 605, 580, 4, 50, 800, 5),
    ("Q-105", "SUP-A", "PHN-003", 88, 82, 6, 200, 5000, 7),
    ("Q-106", "SUP-C", "YOG-002", 398, 380, 7, 100, 1200, 3),
    ("Q-107", "SUP-B", "BOT-004", 296, 284, 4, 100, 900, 5),
]

LOGISTICS = [
    ("LG-1", "BlueDart", "Surface Express", 42, 2, 4.7, True),
    ("LG-2", "Delhivery", "Surface", 34, 3, 4.4, True),
    ("LG-3", "Ekart", "Economy", 29, 4, 4.2, True),
    ("LG-4", "XpressBees", "Standard", 31, 4, 4.1, False),
    ("LG-5", "Shiprocket Air", "Air Priority", 58, 1, 4.5, True),
]

DEMO_PRODUCTS = [
    dict(sku="EAR-001", name="Wireless Earbuds", category="Electronics", price=1499, cost=780, stock=100, avg=20, rr=0.06, icon="headphones"),
    dict(sku="YOG-002", name="Yoga Mat", category="Fitness", price=899, cost=420, stock=240, avg=6, rr=0.04, icon="stretch"),
    dict(sku="PHN-003", name="Phone Case", category="Accessories", price=349, cost=95, stock=180, avg=14, rr=0.19, icon="smartphone"),
    dict(sku="BOT-004", name="Insulated Water Bottle", category="Home & Kitchen", price=649, cost=310, stock=75, avg=5, rr=0.03, icon="bottle"),
    dict(sku="LED-005", name="LED Desk Lamp", category="Electronics", price=1199, cost=640, stock=12, avg=3, rr=0.05, icon="lamp"),
]

DEMO_RETURNS = [
    ("110001", "New Delhi", "PHN-003", 142, 44), ("400001", "Mumbai", "EAR-001", 268, 19),
    ("560001", "Bengaluru", "EAR-001", 231, 12), ("700001", "Kolkata", "YOG-002", 96, 7),
    ("600001", "Chennai", "BOT-004", 84, 3), ("500001", "Hyderabad", "LED-005", 61, 4),
    ("380001", "Ahmedabad", "PHN-003", 118, 21), ("411001", "Pune", "YOG-002", 77, 2),
]

DEMO_COMPETITORS = {
    "EAR-001": [("Amazon.in", 1549), ("Flipkart", 1479), ("Meesho", 1399)],
    "YOG-002": [("Amazon.in", 949), ("Flipkart", 899), ("Meesho", 829)],
    "PHN-003": [("Amazon.in", 399), ("Flipkart", 349), ("Meesho", 299)],
    "BOT-004": [("Amazon.in", 699), ("Flipkart", 649), ("Meesho", 599)],
    "LED-005": [("Amazon.in", 1249), ("Flipkart", 1199), ("Meesho", 1099)],
}


def seed_network(db: Session) -> None:
    """Insert shared network data once. Never overwrites call counters."""
    for a in SERVICE_AGENTS:
        if not db.get(ServiceAgent, a["id"]):
            db.add(ServiceAgent(availability="Online", **a))
    for s in SUPPLIERS:
        if not db.get(Supplier, s["id"]):
            db.add(Supplier(**s))
    db.flush()
    today = date.today()
    for qid, sid, sku, price, floor, days, moq, avail, valid in SUPPLIER_QUOTES:
        q = db.get(SupplierQuote, qid)
        if not q:
            db.add(SupplierQuote(id=qid, supplier_id=sid, sku=sku, unit_price=rupees(price), floor_price=rupees(floor),
                                 delivery_days=days, moq=moq, available=avail, valid_till=today + timedelta(days=valid)))
        elif q.valid_till < today:
            # Demo network: keep seeded quotes current instead of letting them expire.
            q.valid_till = today + timedelta(days=valid)
    for lid, courier, service, cost, eta, rating, cod in LOGISTICS:
        if not db.get(LogisticsQuote, lid):
            db.add(LogisticsQuote(id=lid, courier=courier, service=service, cost_per_500g=rupees(cost), eta_days=eta, rating=rating, cod=cod))
    db.commit()


def ensure_mandate(db: Session, business: Business) -> Mandate:
    m = db.get(Mandate, business.id)
    if not m:
        m = Mandate(business_id=business.id)
        db.add(m)
        db.flush()
    return m


def _today_at(h: int, m: int) -> datetime:
    """That clock time today in IST; yesterday if it hasn't happened yet."""
    now = datetime.now(IST)
    t = datetime.combine(now.date(), time(h, m), IST)
    if t > now:
        t -= timedelta(days=1)
    return t.astimezone(timezone.utc)


def load_demo_business(db: Session, business: Business, user: User) -> None:
    """Replace this seller's store contents with the UrbanNest Living demo."""
    bid = business.id
    # Deals, escrows and stock history belong to the products being replaced,
    # and escrow balances only make sense next to the ledger that funded them.
    neg_ids = select(Negotiation.id).where(Negotiation.business_id == bid)
    db.execute(delete(NegotiationMessage).where(NegotiationMessage.negotiation_id.in_(neg_ids)))
    for model in (Escrow, StockMovement, Negotiation, RFQ, SalesDaily, ReturnStat, CompetitorPrice, WalletTxn,
                  ActivityEvent, AgentCall, Product):
        db.execute(delete(model).where(model.business_id == bid))

    for p in DEMO_PRODUCTS:
        db.add(Product(business_id=bid, sku=p["sku"], name=p["name"], category=p["category"], price=rupees(p["price"]),
                       cost=rupees(p["cost"]), stock=p["stock"], avg_daily_sales=p["avg"], return_rate=p["rr"], icon=p["icon"]))

    # 90 days of daily sales: slow growth, weekly seasonality, fixed-seed noise.
    rng = random.Random(20261031)
    today = date.today()
    for p in DEMO_PRODUCTS:
        trend = 0.75 + rng.random() * 0.15
        for d in range(89, -1, -1):
            day = today - timedelta(days=d)
            growth = trend + ((89 - d) / 89) * (1 - trend)
            dow = day.weekday()  # Mon=0
            weekly = 1.25 if dow >= 5 else 1.12 if dow == 4 else 0.95
            noise = 0.55 + rng.random() * 0.9
            units = max(0, round(p["avg"] * growth * weekly * noise))
            # Most orders are single units; a share are multi-unit baskets.
            orders = units if units < 2 else max(1, round(units / (1.08 + rng.random() * 0.2)))
            db.add(SalesDaily(business_id=bid, day=day, sku=p["sku"], units=units, orders=orders, revenue=units * rupees(p["price"])))

    for pin, city, sku, orders, rets in DEMO_RETURNS:
        db.add(ReturnStat(business_id=bid, pincode=pin, city=city, sku=sku, orders=orders, returns=rets))
    for sku, rows in DEMO_COMPETITORS.items():
        for channel, price in rows:
            db.add(CompetitorPrice(business_id=bid, sku=sku, channel=channel, price=rupees(price)))

    # Wallet: opening top-up, then today's agent purchases. Balance is always
    # the sum of the ledger, so seeded calls and seeded debits agree.
    db.add(WalletTxn(id=new_id("TXN"), business_id=bid, time=_today_at(8, 30), counterparty="Wallet top-up (simulated)",
                     kind="topup", amount=rupees(5000), status="Completed", signature=sign("topup", bid, 5000), memo="Opening balance · demo funds"))
    seeded_calls = [
        ("agent-forecast-01", "EAR-001", 3, (8, 55)),
        ("agent-logistics-04", "EAR-001", 3, (9, 10)),
        ("agent-return-03", "PHN-003", 40, (9, 15)),
        ("agent-price-02", "EAR-001", 4, (9, 18)),
    ]
    names = {p["sku"]: p["name"] for p in DEMO_PRODUCTS}
    agents = {a["id"]: a for a in SERVICE_AGENTS}
    for agent_id, sku, count, (h, m) in seeded_calls:
        a = agents[agent_id]
        for i in range(count):
            t = _today_at(h, m) + timedelta(seconds=i * 7)
            call_id, txn_id = new_id("CALL"), new_id("TXN")
            db.add(AgentCall(id=call_id, agent_id=agent_id, user_id=user.id, business_id=bid, operation=a["operation"], sku=sku,
                             product_name=names[sku], status="success", cost=a["price_per_call"], result={"seeded": True},
                             txn_id=txn_id, created_at=t, completed_at=t))
            db.add(WalletTxn(id=txn_id, business_id=bid, time=t, counterparty=a["name"], kind="service_call",
                             amount=-a["price_per_call"], status="Completed", signature=sign(txn_id, -a["price_per_call"]),
                             memo=f"1 call · {names[sku]} ({sku})", ref=call_id))
    db.add(WalletTxn(id=new_id("TXN"), business_id=bid, time=_today_at(9, 12), counterparty="BlueDart (booking)", kind="logistics",
                     amount=-rupees(500), status="Completed", signature=sign("bluedart", bid, 500), memo="Logistics booking advance — inbound consignment"))

    events = [
        ((8, 55), "Demand Forecast Agent", "3 demand forecasts purchased", "Wireless Earbuds +2", 12, "success", "7-day and 30-day forecasts for EAR-001, PHN-003, LED-005."),
        ((9, 0), "EcomMind", "Stockout risk detected", "Wireless Earbuds", None, "warning", "Coverage fell to 5 days."),
        ((9, 10), "Logistics Agent", "Logistics quotation purchased", None, 3, "success", "3 courier quotes compared; BlueDart Surface recommended."),
        ((9, 12), "EcomMind", "Logistics booking advance paid", None, 500, "success", "BlueDart Surface Express booked for the inbound consignment (simulated)."),
        ((9, 15), "Return Risk Agent", "40 pincode risk scores purchased", "Phone Case", 40, "success", "Pincode 110001 flagged at 31% return rate."),
        ((9, 18), "Market Price Agent", "4 competitor price queries purchased", None, 8, "success", "Earbuds competitor range ₹1,399–₹1,549."),
    ]
    for (h, m), agent, action, product, amount, status, detail in events:
        db.add(ActivityEvent(business_id=bid, time=_today_at(h, m), agent=agent, action=action, product=product,
                             amount=rupees(amount) if amount is not None else None, status=status, detail=detail))

    ensure_mandate(db, business)
    business.demo_loaded = True
    business.agent_status = "active"
    db.commit()


def demo_user_exists(db: Session, canonical: str) -> User | None:
    return db.scalar(select(User).where(User.email_canonical == canonical))
