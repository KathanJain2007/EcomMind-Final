"""Analytics endpoints. Every figure is computed from stored rows; nothing is
randomised or hard-coded. The frontend uses these for KPI cards and charts."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business
from ..models import Business, Product, SalesDaily, ServiceAgent, Supplier
from ..services import intelligence
from ..services.ledger import budget_consumed_today, get_mandate, wallet_balance

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

Days = Query(default=30, ge=1, le=365)


def _products(db: Session, biz: Business, category: str | None) -> dict[str, Product]:
    rows = db.scalars(select(Product).where(Product.business_id == biz.id)).all()
    return {p.sku: p for p in rows if not category or category == "All" or p.category == category}


def _window(days: int, offset: int = 0) -> tuple[date, date]:
    end = date.today() - timedelta(days=offset)
    return end - timedelta(days=days - 1), end


def _totals(db: Session, biz: Business, products: dict[str, Product], days: int, offset: int = 0) -> dict:
    start, end = _window(days, offset)
    rows = db.execute(select(SalesDaily.sku, func.sum(SalesDaily.units), func.sum(SalesDaily.orders), func.sum(SalesDaily.revenue))
                      .where(SalesDaily.business_id == biz.id, SalesDaily.day >= start, SalesDaily.day <= end)
                      .group_by(SalesDaily.sku)).all()
    units = orders = revenue = profit = 0
    for sku, u, o, r in rows:
        if sku not in products:
            continue
        p = products[sku]
        units, orders, revenue = units + (u or 0), orders + (o or 0), revenue + (r or 0)
        profit += (u or 0) * (p.price - p.cost)
    return {"units": units, "orders": orders, "revenue": revenue, "profit": profit}


def _delta(cur: float, prev: float) -> float | None:
    return round((cur - prev) / prev * 100, 1) if prev else None


@router.get("/summary")
def summary(days: int = Days, category: str | None = None, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    products = _products(db, biz, category)
    cur = _totals(db, biz, products, days)
    prev = _totals(db, biz, products, days, offset=days)
    statuses = [intelligence.stock_status(p) for p in products.values()]
    mandate = get_mandate(db, biz.id)
    online = db.scalar(select(func.count()).select_from(ServiceAgent).where(ServiceAgent.availability == "Online")) or 0
    suppliers = db.scalar(select(func.count()).select_from(Supplier)) or 0
    agents_running = biz.agent_status == "active" and not mandate.agents_paused
    db.commit()
    return {
        "days": days, "category": category or "All",
        "revenue": cur["revenue"], "orders": cur["orders"], "units": cur["units"], "profit": cur["profit"],
        "avgOrderValue": round(cur["revenue"] / cur["orders"]) if cur["orders"] else 0,
        "grossMarginPct": round(cur["profit"] / cur["revenue"] * 100, 1) if cur["revenue"] else None,
        "deltas": {k: _delta(cur[k], prev[k]) for k in ("revenue", "orders", "units", "profit")},
        "productCount": len(products),
        "needsAttention": sum(s in ("Critical", "Low Stock", "Out of Stock") for s in statuses),
        "inventoryValue": sum(p.stock * p.cost for p in products.values()),
        # EcomMind itself + online service agents, when not paused.
        "activeAgents": (online + 1) if agents_running else 0,
        "agentsDiscovered": online + suppliers,
        "walletBalance": wallet_balance(db, biz.id),
        "budget": {"daily": mandate.daily_budget, "consumedToday": budget_consumed_today(db, biz.id)},
    }


@router.get("/daily")
def daily(days: int = Days, category: str | None = None, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    products = _products(db, biz, category)
    start, end = _window(days)
    rows = db.execute(select(SalesDaily.day, SalesDaily.sku, SalesDaily.units, SalesDaily.orders, SalesDaily.revenue)
                      .where(SalesDaily.business_id == biz.id, SalesDaily.day >= start, SalesDaily.day <= end)).all()
    by_day: dict[date, dict] = {start + timedelta(days=i): {"revenue": 0, "orders": 0, "units": 0} for i in range(days)}
    for d, sku, u, o, r in rows:
        if sku in products:
            b = by_day[d]
            b["units"] += u
            b["orders"] += o
            b["revenue"] += r
    has_data = any(v["units"] for v in by_day.values())
    return {"days": days, "series": [{"date": d.isoformat(), **v} for d, v in sorted(by_day.items())] if has_data else []}


@router.get("/products")
def by_product(days: int = Days, category: str | None = None, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    products = _products(db, biz, category)
    start, end = _window(days)
    rows = db.execute(select(SalesDaily.sku, func.sum(SalesDaily.units), func.sum(SalesDaily.orders), func.sum(SalesDaily.revenue))
                      .where(SalesDaily.business_id == biz.id, SalesDaily.day >= start, SalesDaily.day <= end)
                      .group_by(SalesDaily.sku)).all()
    agg = {sku: (u or 0, o or 0, r or 0) for sku, u, o, r in rows}
    out = []
    for p in products.values():
        u, o, r = agg.get(p.sku, (0, 0, 0))
        out.append({"sku": p.sku, "name": p.name, "category": p.category, "icon": p.icon, "units": u, "orders": o,
                    "revenue": r, "profit": u * (p.price - p.cost),
                    "marginPct": round((p.price - p.cost) / p.price * 100, 1) if p.price else None})
    by_cat: dict[str, int] = defaultdict(int)
    for row in out:
        by_cat[row["category"]] += row["revenue"]
    return {"days": days, "products": sorted(out, key=lambda x: -x["revenue"]),
            "categories": [{"name": k, "revenue": v} for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1])]}


@router.get("/inventory")
def inventory(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(select(Product).where(Product.business_id == biz.id).order_by(Product.id)).all()
    return {"products": [{"sku": p.sku, "name": p.name, "stock": p.stock, "coverageDays": intelligence.coverage_days(p),
                          "status": intelligence.stock_status(p)} for p in rows]}


@router.get("/forecast/{sku}")
def forecast(sku: str, days: int = Query(default=14, ge=7, le=60), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.business_id == biz.id, Product.sku == sku.upper()))
    if not p:
        from ..errors import ApiError
        raise ApiError(404, "product_not_found", "Product not found.")
    return intelligence.forecast(db, p, days)


@router.get("/returns")
def returns(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(select(Product).where(Product.business_id == biz.id).order_by(Product.id)).all()
    risk = intelligence.return_risk(db, biz.id)
    names = {p.sku: p.name for p in rows}
    for r in risk["pincodes"] + risk["highRisk"]:
        r["productName"] = names.get(r["sku"], r["sku"])
    return {**risk, "byProduct": [{"sku": p.sku, "name": p.name, "returnRate": p.return_rate} for p in rows]}


@router.get("/logistics")
def logistics(_: Business = Depends(current_business), db: Session = Depends(get_db)):
    return intelligence.logistics_ranking(db)


@router.get("/recommendations")
def recommendations(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    """Recommendations derived from current stock, forecasts and return data."""
    from ..models import SupplierQuote

    out = []
    rows = db.scalars(select(Product).where(Product.business_id == biz.id).order_by(Product.id)).all()
    for p in rows:
        status = intelligence.stock_status(p)
        if status not in ("Critical", "Low Stock", "Out of Stock"):
            continue
        f = intelligence.forecast(db, p)
        quote = db.scalar(select(SupplierQuote).where(SupplierQuote.sku == p.sku).order_by(SupplierQuote.unit_price))
        lost = max(0, f["demand30"] - p.stock) * p.price
        out.append({
            "id": f"restock-{p.sku}", "priority": "High" if status != "Low Stock" else "Medium", "sku": p.sku,
            "title": f"Restock {p.name}",
            "reason": f"{p.stock} units left, about {intelligence.coverage_days(p)} days of cover against forecast demand of {f['demand30']} units over 30 days.",
            "impactValue": lost, "impact": "Protects sales that current stock can't cover." if lost else "Keeps a safety buffer in stock.",
            "action": f"Order {f['reorderQty']} units" + (f" — best quote ₹{quote.unit_price / 100:,.0f}/unit." if quote else "."),
        })
    risk = intelligence.return_risk(db, biz.id)
    names = {p.sku: p.name for p in rows}
    for r in risk["highRisk"][:2]:
        out.append({
            "id": f"returns-{r['pincode']}-{r['sku']}", "priority": "High" if r["returnRate"] >= 0.25 else "Medium", "sku": r["sku"],
            "title": f"Review {names.get(r['sku'], r['sku'])} returns in {r['city']}",
            "reason": f"Return rate {r['returnRate'] * 100:.0f}% in pincode {r['pincode']} ({r['returns']} of {r['orders']} orders).",
            "impactValue": None, "impact": "Cuts reverse-logistics cost on high-risk orders.",
            "action": "Require prepaid or confirmation calls for this pincode.",
        })
    return {"recommendations": out}


@router.get("/wallet-daily")
def wallet_daily(days: int = Query(default=7, ge=1, le=90), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    """Wallet debits per day (India time) for the spending chart."""
    from datetime import datetime, time as dtime, timezone as tz

    from ..models import WalletTxn
    from ..services.ledger import IST

    today = datetime.now(IST).date()
    start = datetime.combine(today - timedelta(days=days - 1), dtime(0), IST).astimezone(tz.utc)
    rows = db.execute(select(WalletTxn.time, WalletTxn.amount).where(
        WalletTxn.business_id == biz.id, WalletTxn.amount < 0, WalletTxn.time >= start,
        WalletTxn.kind.in_(["service_call", "logistics"]))).all()
    buckets = {today - timedelta(days=i): 0 for i in range(days)}
    for t, amt in rows:
        d = (t if t.tzinfo else t.replace(tzinfo=tz.utc)).astimezone(IST).date()
        if d in buckets:
            buckets[d] += -amt
    return {"series": [{"date": d.isoformat(), "amount": v} for d, v in sorted(buckets.items())]}
