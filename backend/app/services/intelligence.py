"""Business intelligence computed from stored data: stock status, demand
forecast, price suggestion, return risk and courier ranking. Used by the
analytics endpoints AND by the paid service agents, so a forecast bought from
the Demand Forecast Agent matches the forecast chart."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CompetitorPrice, LogisticsQuote, Mandate, Product, ReturnStat, SalesDaily

HIGH_RISK_RETURN_RATE = 0.15


def coverage_days(p: Product) -> float | None:
    if p.avg_daily_sales <= 0:
        return None
    return round(p.stock / p.avg_daily_sales, 1)


def stock_status(p: Product) -> str:
    if p.paused:
        return "Paused"
    if p.stock == 0:
        return "Out of Stock"
    cov = p.stock / p.avg_daily_sales if p.avg_daily_sales > 0 else float("inf")
    if cov <= 5:
        return "Critical"
    if cov <= 12:
        return "Low Stock"
    return "In Stock"


def _daily_units(db: Session, business_id: int, sku: str, days: int) -> dict[date, int]:
    since = date.today() - timedelta(days=days - 1)
    rows = db.execute(
        select(SalesDaily.day, SalesDaily.units).where(
            SalesDaily.business_id == business_id, SalesDaily.sku == sku, SalesDaily.day >= since)
    ).all()
    out = {since + timedelta(days=i): 0 for i in range(days)}
    for d, u in rows:
        out[d] = out.get(d, 0) + u
    return out


def _model(history: dict[date, int]) -> tuple[float, dict[int, float]]:
    """Level = mean of the last 14 days; weekday factors from the full window."""
    days = sorted(history)
    values = [history[d] for d in days]
    level = mean(values[-14:]) if values else 0.0
    overall = mean(values) if values else 0.0
    by_dow: dict[int, list[int]] = defaultdict(list)
    for d in days:
        by_dow[d.weekday()].append(history[d])
    factors = {k: (mean(v) / overall if overall else 1.0) for k, v in by_dow.items()}
    return level, factors


def forecast(db: Session, product: Product, history_days: int = 14) -> dict:
    """Seasonal-naive forecast: recent level x weekday factor.

    Confidence comes from a backtest: fit on data up to 14 days ago, predict the
    last 14 days, and report 1 - MAPE. No fixed numbers.
    """
    full = _daily_units(db, product.business_id, product.sku, 70)
    if not any(full.values()):
        level = product.avg_daily_sales
        factors: dict[int, float] = {}
        confidence = None
    else:
        level, factors = _model(full)
        days = sorted(full)
        train = {d: full[d] for d in days[:-14]}
        test = days[-14:]
        confidence = None
        if len(train) >= 28:
            lvl, fac = _model(train)
            errors = [abs(full[d] - lvl * fac.get(d.weekday(), 1.0)) / full[d] for d in test if full[d] > 0]
            if errors:
                confidence = round(max(0.0, 1 - mean(errors)) * 100)

    today = date.today()
    predicted = [(today + timedelta(days=i + 1), level * factors.get((today + timedelta(days=i + 1)).weekday(), 1.0)) for i in range(30)]
    demand7 = round(sum(v for _, v in predicted[:7]))
    demand30 = round(sum(v for _, v in predicted))
    safety = round(level * 5)
    reorder = max(0, demand30 - product.stock + safety)

    hist = sorted(full.items())[-history_days:]
    series = [{"date": d.isoformat(), "actual": u} for d, u in hist]
    series += [{"date": d.isoformat(), "predicted": round(v, 1)} for d, v in predicted[:7]]
    return {
        "sku": product.sku, "productName": product.name,
        "series": series,
        "demand7": demand7, "demand30": demand30,
        "recommendedStock": demand30 + safety, "reorderQty": reorder,
        "confidencePct": confidence,
        "method": "Recent 14-day level x weekday seasonality; confidence = 1 - MAPE on a 14-day backtest.",
    }


def price_suggestion(db: Session, product: Product, mandate: Mandate) -> dict:
    rows = db.scalars(select(CompetitorPrice).where(
        CompetitorPrice.business_id == product.business_id, CompetitorPrice.sku == product.sku)).all()
    competitors = [{"channel": r.channel, "price": r.price} for r in rows]
    margin_floor = round(product.cost / (1 - mandate.min_gross_margin_pct / 100)) if mandate.min_gross_margin_pct < 100 else product.cost
    band_low = round(product.price * (1 - mandate.max_price_change_pct / 100))
    band_high = round(product.price * (1 + mandate.max_price_change_pct / 100))
    if not competitors:
        return {"competitors": [], "suggestedPrice": None, "reason": "No competitor prices on file for this product.",
                "marginFloor": margin_floor}
    lowest = min(c["price"] for c in competitors)
    target = round(lowest * 1.02 / 100) * 100 - 100  # ~2% above the cheapest channel, ending in 99
    suggested = min(max(target, margin_floor, band_low), band_high)
    limited_by = "margin floor" if suggested == margin_floor and target < margin_floor else \
        "repricing limit" if suggested in (band_low, band_high) and suggested != target else None
    margin = lambda price: round((price - product.cost) / price * 100, 1) if price else None  # noqa: E731
    return {
        "competitors": competitors, "lowestCompetitor": lowest, "suggestedPrice": suggested,
        "marginNowPct": margin(product.price), "marginAtSuggestedPct": margin(suggested),
        "marginFloor": margin_floor, "limitedBy": limited_by,
    }


def return_risk(db: Session, business_id: int, sku: str | None = None) -> dict:
    q = select(ReturnStat).where(ReturnStat.business_id == business_id)
    if sku:
        q = q.where(ReturnStat.sku == sku)
    rows = db.scalars(q).all()
    pincodes = [{
        "pincode": r.pincode, "city": r.city, "sku": r.sku, "orders": r.orders, "returns": r.returns,
        "returnRate": round(r.returns / r.orders, 4) if r.orders else 0.0,
    } for r in rows]
    orders = sum(r.orders for r in rows)
    returns = sum(r.returns for r in rows)
    return {
        "overallReturnRate": round(returns / orders, 4) if orders else None,
        "pincodes": sorted(pincodes, key=lambda x: -x["returnRate"]),
        "highRisk": [p for p in pincodes if p["returnRate"] >= HIGH_RISK_RETURN_RATE],
        "threshold": HIGH_RISK_RETURN_RATE,
    }


def logistics_ranking(db: Session, business_id: int | None = None) -> dict:
    from sqlalchemy import or_
    quotes = db.scalars(select(LogisticsQuote).where(or_(LogisticsQuote.business_id.is_(None),
                                                         LogisticsQuote.business_id == business_id))).all()
    if not quotes:
        return {"quotes": [], "recommended": None}
    max_cost = max(q.cost_per_500g for q in quotes)
    max_eta = max(q.eta_days for q in quotes)

    def score(q: LogisticsQuote) -> float:
        # Lower is better: cost and speed weighted equally, rating as tiebreaker, COD required for a pick.
        return 0.45 * q.cost_per_500g / max_cost + 0.45 * q.eta_days / max_eta - 0.1 * q.rating / 5 + (0 if q.cod else 1)

    ranked = sorted(quotes, key=score)
    rows = [{"id": q.id, "courier": q.courier, "service": q.service, "costPer500g": q.cost_per_500g,
             "etaDays": q.eta_days, "rating": q.rating, "cod": q.cod} for q in ranked]
    return {"quotes": rows, "recommended": rows[0]["id"],
            "method": "Ranked on cost and delivery time (45% each) and rating (10%); couriers without COD rank last."}
