"""Data import: one service for the Import Data page and onboarding.

A file is parsed on the server (CSV, or every matching sheet of an XLSX
workbook), each row is validated, and valid rows are written to the seller's
own tables in one transaction:

  products         -> products (upsert by SKU; price changes go to price_changes,
                      stock changes to stock_movements)
  sales            -> sales_daily (upsert by date + SKU), then avg_daily_sales is
                      recomputed from the last 28 days
  returns          -> return_stats (upsert by pincode + SKU)
  supplier_quotes  -> the seller's own suppliers / supplier_quotes (upsert by supplier + SKU)
  logistics        -> the seller's own logistics_quotes (upsert by courier + service)
  mandate          -> the seller's mandate limits

Re-importing the same file into the same dataset is detected by its SHA-256
and changes nothing. Overlapping rows from different files update instead of
duplicating. Invalid rows are skipped and reported with their row number.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import (
    ImportBatch, LogisticsQuote, PriceChange, Product, ReturnStat, SalesDaily, Supplier, SupplierQuote,
)
from ..security import new_id
from . import pricing
from .ledger import IST, get_mandate, log_activity
from .orders import record_movement

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 50_000
MAX_ERRORS = 200

DATASETS: dict[str, dict] = {
    "products": {"label": "Products", "required": ["sku", "name", "price", "cost", "stock"],
                 "optional": ["category", "avg_daily_sales", "return_rate"], "match": ["product", "inventory", "catalog"]},
    "sales": {"label": "Sales history", "required": ["date", "sku", "units"], "optional": ["orders", "revenue"], "match": ["sales"]},
    "returns": {"label": "Returns by pincode", "required": ["pincode", "sku", "orders", "returns"], "optional": ["city"],
                "match": ["return"]},
    "supplier_quotes": {"label": "Supplier quotes", "required": ["supplier", "sku", "unit_price", "delivery_days"],
                        "optional": ["moq", "available_qty", "valid_until", "location"], "match": ["supplier", "quote"]},
    "logistics": {"label": "Logistics quotes", "required": ["courier", "cost_per_500g", "eta_days"],
                  "optional": ["service", "rating", "cod"], "match": ["logistic", "courier"]},
    "mandate": {"label": "Seller mandate", "required": ["daily_budget", "max_order_value", "max_per_call_cost"],
                "optional": [], "match": ["mandate"]},
}
ORDER = ["products", "mandate", "logistics", "supplier_quotes", "sales", "returns"]  # products first: others refer to SKUs

ALIASES = {
    # Products
    "product": "name", "product_name": "name", "item": "name", "item_name": "name",
    "title": "name", "description": "name", "item_code": "sku", "product_code": "sku",
    "sku_code": "sku", "barcode": "sku", "selling_price": "price", "sale_price": "price",
    "retail_price": "price", "mrp": "price", "listing_price": "price", "unit_cost": "cost",
    "cost_price": "cost", "purchase_price": "cost", "buy_price": "cost", "cogs": "cost",
    "inventory": "stock", "available_stock": "stock", "stock_quantity": "stock",
    "quantity_on_hand": "stock", "qty_on_hand": "stock", "on_hand": "stock", "in_stock": "stock",
    "category_name": "category", "department": "category",
    "avg_sales": "avg_daily_sales", "daily_sales": "avg_daily_sales", "average_daily_sales": "avg_daily_sales",
    "ads": "avg_daily_sales", "return_pct": "return_rate", "return_percentage": "return_rate",
    "returns_rate": "return_rate",
    # Sales
    "quantity": "units", "qty": "units", "units_sold": "units", "quantity_sold": "units", "volume": "units",
    "order_date": "date", "sale_date": "date", "sales_date": "date", "day": "date", "transaction_date": "date",
    "total_orders": "orders", "order_count": "orders", "no_of_orders": "orders",
    "sales": "revenue", "total_sales": "revenue", "gross_revenue": "revenue", "amount": "revenue", "order_value": "revenue",
    # Returns
    "pin": "pincode", "pin_code": "pincode", "postal_code": "pincode", "zip": "pincode", "zip_code": "pincode", "zipcode": "pincode",
    "return_count": "returns", "returned_units": "returns", "returned_orders": "returns", "total_returns": "returns",
    "rto": "returns", "rto_count": "returns", "rto_orders": "returns",
    # Supplier quotes
    "supplier_name": "supplier", "vendor": "supplier", "vendor_name": "supplier", "seller": "supplier",
    "price_per_unit": "unit_price", "quote": "unit_price", "quoted_price": "unit_price", "rate": "unit_price",
    "lead_time_days": "delivery_days", "lead_time": "delivery_days", "delivery_time": "delivery_days",
    "min_order_qty": "moq", "min_qty": "moq", "minimum_order_quantity": "moq",
    "available": "available_qty", "valid_till": "valid_until", "expiry": "valid_until", "validity": "valid_until",
    # Logistics
    "courier_name": "courier", "carrier": "courier", "logistics_partner": "courier", "delivery_partner": "courier", "provider": "courier",
    "cost_500g": "cost_per_500g", "rate_500g": "cost_per_500g", "rate_per_500g": "cost_per_500g", "cost_per_half_kg": "cost_per_500g",
    "shipping_rate": "cost_per_500g", "shipping_cost": "cost_per_500g",
    "eta": "eta_days", "estimated_days": "eta_days", "tat": "eta_days", "tat_days": "eta_days", "sla_days": "eta_days",
    # Mandate
    "budget": "daily_budget", "daily_spending_limit": "daily_budget", "max_order": "max_order_value", "max_order_limit": "max_order_value",
    "per_call_cost": "max_per_call_cost", "max_call_cost": "max_per_call_cost",
}

SKU_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$")
PIN_RE = re.compile(r"^[1-9][0-9]{5}$")


class RowError(Exception):
    pass


# --------------------------------------------------------------------------- parsing

def _norm_header(h: Any) -> str:
    k = re.sub(r"[^a-z0-9]+", "_", str(h or "").strip().lower()).strip("_")
    k = re.sub(r"_(inr|rs|rupees)$", "", k)  # "Price (INR)" -> "price"
    return ALIASES.get(k, k)


def _cell(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def parse_csv(content: bytes) -> list[dict[str, str]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any(c.strip() for c in r)]
    if not rows:
        return []
    headers = [_norm_header(h) for h in rows[0]]
    return [{h: (r[i].strip() if i < len(r) else "") for i, h in enumerate(headers) if h} for r in rows[1:]]


def parse_xlsx(content: bytes) -> dict[str, list[dict[str, str]]]:
    try:
        import openpyxl
    except ImportError as e:  # pragma: no cover
        raise ApiError(500, "xlsx_unavailable", "Excel support isn't installed on the server (openpyxl).") from e
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001 - any parse failure is a bad file
        raise ApiError(422, "unreadable_file", "That Excel file couldn't be read. Save it as .xlsx and try again.") from e
    out: dict[str, list[dict[str, str]]] = {}
    for ws in wb.worksheets:
        it = ws.iter_rows(values_only=True)
        header = next(it, None)
        if not header:
            continue
        headers = [_norm_header(h) for h in header]
        rows = []
        for r in it:
            if r is None or not any(_cell(v) for v in r):
                continue
            rows.append({h: _cell(r[i]) if i < len(r) else "" for i, h in enumerate(headers) if h})
            if len(rows) > MAX_ROWS:
                break
        out[ws.title] = rows
    wb.close()
    return out


def _effective_cols(columns: list[str]) -> set[str]:
    cols = set(columns)
    if "units" in cols or "quantity" in cols or "qty" in cols:
        cols.add("units")
        cols.add("stock")
    if "price" in cols or "unit_price" in cols:
        cols.add("price")
        cols.add("unit_price")
    if "delivery_days" in cols or "eta_days" in cols:
        cols.add("delivery_days")
        cols.add("eta_days")
    return cols


def detect_dataset(name: str, columns: Optional[list[str]] = None) -> Optional[str]:
    # 1. Match by columns first when provided (most definitive signal)
    if columns:
        cols = _effective_cols(columns)
        matches = [k for k, d in DATASETS.items() if set(d["required"]) <= cols]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            matches.sort(key=lambda k: len(DATASETS[k]["required"]), reverse=True)
            return matches[0]

    # 2. Fall back to filename or sheet name keywords
    n = name.lower()
    for key in ("products", "sales", "returns", "logistics", "mandate", "supplier_quotes"):  # most specific first
        if any(m in n for m in DATASETS[key]["match"]):
            return key
    return None


# --------------------------------------------------------------------------- value helpers

def _num(row: dict, col: str, *, required: bool = True, minimum: Optional[float] = None, integer: bool = False,
         gt: Optional[float] = None) -> Optional[float]:
    raw = (row.get(col) or "").strip()
    raw = raw.replace(",", "").replace("₹", "").replace("$", "").strip()
    raw = re.sub(r"^(rs\.?|inr)\s*", "", raw, flags=re.IGNORECASE).strip()
    raw = re.sub(r"\s*/-\s*$", "", raw).strip()
    if raw == "":
        if required:
            raise RowError(f'"{col}" is empty')
        return None
    try:
        v = float(raw)
    except ValueError:
        raise RowError(f'"{col}" must be a number (got "{row.get(col)}")') from None
    if v != v or v in (float("inf"), float("-inf")):
        raise RowError(f'"{col}" must be a number')
    if integer and not v.is_integer():
        raise RowError(f'"{col}" must be a whole number (got "{row.get(col)}")')
    if minimum is not None and v < minimum:
        raise RowError(f'"{col}" can\'t be below {minimum:g}')
    if gt is not None and v <= gt:
        raise RowError(f'"{col}" must be greater than {gt:g}')
    return v


def _paise(row: dict, col: str, **kw) -> Optional[int]:
    v = _num(row, col, **kw)
    return None if v is None else int(round(v * 100))


def _text(row: dict, col: str, max_len: int, required: bool = True) -> Optional[str]:
    v = (row.get(col) or "").strip()
    if not v:
        if required:
            raise RowError(f'"{col}" is empty')
        return None
    if len(v) > max_len:
        raise RowError(f'"{col}" is longer than {max_len} characters')
    return v


def _date(row: dict, col: str, required: bool = True) -> Optional[date]:
    raw = (row.get(col) or "").strip()
    if not raw:
        if required:
            raise RowError(f'"{col}" is empty')
        return None
    cleaned = raw.split("T")[0].strip() if "T" in raw else raw
    for fmt in (
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y", "%m.%d.%Y",
        "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M",
        "%d-%b-%Y", "%d-%b-%y", "%d %b %Y", "%d %b %y",
    ):
        for candidate in (raw, cleaned):
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
    raise RowError(f'"{col}" isn\'t a date (use YYYY-MM-DD or DD-MM-YYYY; got "{raw}")')


def _sku(row: dict, catalogue: dict[str, Product]) -> Product:
    sku = _text(row, "sku", 40).upper()
    if sku not in catalogue:
        raise RowError(f'unknown product SKU "{sku}" (import or add the product first)')
    return catalogue[sku]


# --------------------------------------------------------------------------- dataset writers

class Ctx:
    def __init__(self, db: Session, business_id: int, user_name: str):
        self.db, self.business_id, self.user_name = db, business_id, user_name
        self.created = self.updated = self.unchanged = 0
        self.touched_skus: set[str] = set()

    def catalogue(self) -> dict[str, Product]:
        return {p.sku: p for p in self.db.scalars(select(Product).where(Product.business_id == self.business_id)).all()}


def _products(ctx: Ctx, rows: list[dict], fail: Callable[[int, str], None]) -> None:
    cat = ctx.catalogue()
    seen: set[str] = set()
    for i, row in enumerate(rows, start=2):
        try:
            sku = _text(row, "sku", 40).upper()
            if not SKU_RE.match(sku):
                raise RowError(f'SKU "{sku}" may only contain letters, digits, - and _')
            if sku in seen:
                raise RowError(f'SKU "{sku}" appears more than once in this file')
            name = _text(row, "name", 160)
            price = _paise(row, "price", gt=0)
            cost = _paise(row, "cost", required=False, minimum=0) or 0
            stock_num = _num(row, "stock", required=False, minimum=0, integer=True)
            stock = int(stock_num) if stock_num is not None else 0
            avg = _num(row, "avg_daily_sales", required=False, minimum=0)
            rr = _num(row, "return_rate", required=False, minimum=0)
            if rr is not None and rr > 1:
                rr = rr / 100 if rr <= 100 else None
                if rr is None:
                    raise RowError('"return_rate" must be a fraction (0.06) or a percentage (6)')
            category = _text(row, "category", 80, required=False) or "General"
        except RowError as e:
            fail(i, str(e))
            continue
        seen.add(sku)
        p = cat.get(sku)
        if p is None:
            p = Product(business_id=ctx.business_id, sku=sku, name=name, category=category, price=price, cost=cost, stock=stock,
                        avg_daily_sales=avg or 0.0, return_rate=rr if rr is not None else 0.05, icon="package")
            ctx.db.add(p)
            ctx.db.flush()
            record_movement(ctx.db, p, stock, "import", "Opening stock from import")
            cat[sku] = p
            ctx.created += 1
            continue
        changed = False
        if p.price != price:
            ev = pricing.Evaluation(old_price=p.price, new_price=price,
                                    pct_change=round((price - p.price) / p.price * 100, 1) if p.price else 100.0,
                                    margin_pct=pricing.gross_margin_pct(price, cost), min_margin_met=True, max_change_met=True,
                                    max_discount_met=True, mode_allows=True, autonomy_allows=True, band_pct=0)
            ctx.db.add(PriceChange(id=new_id("PRC"), business_id=ctx.business_id, sku=sku, product_name=name,
                                   old_price=p.price, new_price=price, pct_change=ev.pct_change, margin_pct=ev.margin_pct,
                                   reason="Price from imported catalogue file", source="import",
                                   actor=f"Seller · {ctx.user_name}"[:80], user_id=None, seller_override=False,
                                   safeguards={"import": True}))
            p.price = price
            changed = True
        if p.stock != stock:
            delta = stock - p.stock
            p.stock = stock
            record_movement(ctx.db, p, delta, "import", "Stock count from imported catalogue file")
            changed = True
        for attr, val in (("name", name), ("category", category), ("cost", cost)):
            if getattr(p, attr) != val:
                setattr(p, attr, val)
                changed = True
        if avg is not None and p.avg_daily_sales != avg:
            p.avg_daily_sales, changed = avg, True
        if rr is not None and p.return_rate != rr:
            p.return_rate, changed = rr, True
        if changed:
            ctx.updated += 1
        else:
            ctx.unchanged += 1


def _sales(ctx: Ctx, rows: list[dict], fail: Callable[[int, str], None]) -> None:
    cat = ctx.catalogue()
    today = datetime.now(IST).date()
    seen: set[tuple] = set()
    existing = {(s.day, s.sku): s for s in ctx.db.scalars(select(SalesDaily).where(SalesDaily.business_id == ctx.business_id))}
    for i, row in enumerate(rows, start=2):
        try:
            day = _date(row, "date")
            if day > today:
                raise RowError(f"date {day.isoformat()} is in the future")
            if day < today - timedelta(days=3650):
                raise RowError(f"date {day.isoformat()} is more than 10 years ago")
            p = _sku(row, cat)
            units = int(_num(row, "units", minimum=0, integer=True))
            orders = _num(row, "orders", required=False, minimum=0, integer=True)
            orders = int(orders) if orders is not None else units
            if orders > units:
                raise RowError("orders can't be more than units")
            revenue = _paise(row, "revenue", required=False, minimum=0)
            revenue = revenue if revenue is not None else units * p.price
            key = (day, p.sku)
            if key in seen:
                raise RowError(f"{p.sku} on {day.isoformat()} appears more than once in this file")
        except RowError as e:
            fail(i, str(e))
            continue
        seen.add(key)
        ctx.touched_skus.add(p.sku)
        row_db = existing.get(key)
        if row_db is None:
            row_db = SalesDaily(business_id=ctx.business_id, day=day, sku=p.sku, units=units, orders=orders, revenue=revenue)
            ctx.db.add(row_db)
            existing[key] = row_db
            ctx.created += 1
        elif (row_db.units, row_db.orders, row_db.revenue) != (units, orders, revenue):
            row_db.units, row_db.orders, row_db.revenue = units, orders, revenue
            ctx.updated += 1
        else:
            ctx.unchanged += 1
    ctx.db.flush()
    # Coverage and forecasts use avg_daily_sales: recompute it from the last 28 days of sales.
    since = today - timedelta(days=27)
    for sku in ctx.touched_skus:
        total, first = ctx.db.execute(select(func.coalesce(func.sum(SalesDaily.units), 0), func.min(SalesDaily.day)).where(
            SalesDaily.business_id == ctx.business_id, SalesDaily.sku == sku, SalesDaily.day >= since)).one()
        if first is None:
            continue
        days = max(7, (today - first).days + 1)
        cat[sku].avg_daily_sales = round(int(total) / days, 2)


def _returns(ctx: Ctx, rows: list[dict], fail: Callable[[int, str], None]) -> None:
    cat = ctx.catalogue()
    existing = {(r.pincode, r.sku): r for r in ctx.db.scalars(select(ReturnStat).where(ReturnStat.business_id == ctx.business_id))}
    seen: set[tuple] = set()
    for i, row in enumerate(rows, start=2):
        try:
            pin = re.sub(r"[\s\-]", "", _text(row, "pincode", 10))
            if not PIN_RE.match(pin):
                raise RowError(f'"{pin}" isn\'t a 6-digit Indian pincode')
            p = _sku(row, cat)
            orders = int(_num(row, "orders", minimum=0, integer=True))
            rets = int(_num(row, "returns", minimum=0, integer=True))
            if rets > orders:
                raise RowError("returns can't be more than orders")
            city = _text(row, "city", 80, required=False) or ""
            key = (pin, p.sku)
            if key in seen:
                raise RowError(f"{p.sku} for pincode {pin} appears more than once in this file")
        except RowError as e:
            fail(i, str(e))
            continue
        seen.add(key)
        r = existing.get(key)
        if r is None:
            r = ReturnStat(business_id=ctx.business_id, pincode=pin, city=city, sku=p.sku, orders=orders, returns=rets)
            ctx.db.add(r)
            existing[key] = r
            ctx.created += 1
        elif (r.orders, r.returns) != (orders, rets) or (city and r.city != city):
            r.orders, r.returns = orders, rets
            r.city = city or r.city
            ctx.updated += 1
        else:
            ctx.unchanged += 1


def _supplier_for(ctx: Ctx, name: str, location: Optional[str]) -> Supplier:
    """Match a network supplier by name, else use (or create) the seller's own supplier."""
    low = name.lower().strip()
    for s in ctx.db.scalars(select(Supplier).where(or_(Supplier.business_id.is_(None), Supplier.business_id == ctx.business_id))):
        full = s.name.lower()
        parts = [x.strip() for x in full.split("—")]
        if low == full or low in parts or low == s.id.lower():
            return s
    s = Supplier(id=new_id("SUP"), name=name[:120], agent_id="manual", location=(location or "")[:80], rating=0.0, reviews=0,
                 verified=False, auto_respond=True, business_id=ctx.business_id)
    ctx.db.add(s)
    ctx.db.flush()
    return s


def _supplier_quotes(ctx: Ctx, rows: list[dict], fail: Callable[[int, str], None]) -> None:
    cat = ctx.catalogue()
    seen: set[tuple] = set()
    now = datetime.now(timezone.utc)
    for i, row in enumerate(rows, start=2):
        try:
            name = _text(row, "supplier", 120)
            p = _sku(row, cat)
            price = _paise(row, "unit_price", gt=0)
            days = int(_num(row, "delivery_days", minimum=0, integer=True))
            if days > 365:
                raise RowError('"delivery_days" must be 365 or less')
            moq = _num(row, "moq", required=False, minimum=1, integer=True)
            avail = _num(row, "available_qty", required=False, minimum=0, integer=True)
            valid = _date(row, "valid_until", required=False) or (datetime.now(IST).date() + timedelta(days=30))
            location = _text(row, "location", 80, required=False)
        except RowError as e:
            fail(i, str(e))
            continue
        s = _supplier_for(ctx, name, location)
        key = (s.id, p.sku)
        if key in seen:
            fail(i, f"{name} / {p.sku} appears more than once in this file")
            continue
        seen.add(key)
        q = ctx.db.scalar(select(SupplierQuote).where(SupplierQuote.business_id == ctx.business_id, SupplierQuote.supplier_id == s.id,
                                                      SupplierQuote.sku == p.sku))
        vals = dict(unit_price=price, floor_price=price, delivery_days=days, moq=int(moq or 1),
                    available=int(avail if avail is not None else 0), valid_till=valid)
        if q is None:
            ctx.db.add(SupplierQuote(id=new_id("SQ"), supplier_id=s.id, sku=p.sku, business_id=ctx.business_id, source="import",
                                     updated_at=now, **vals))
            ctx.created += 1
        elif any(getattr(q, k) != v for k, v in vals.items()):
            for k, v in vals.items():
                setattr(q, k, v)
            q.updated_at = now
            ctx.updated += 1
        else:
            ctx.unchanged += 1


def _logistics(ctx: Ctx, rows: list[dict], fail: Callable[[int, str], None]) -> None:
    seen: set[tuple] = set()
    for i, row in enumerate(rows, start=2):
        try:
            courier = _text(row, "courier", 60)
            service = _text(row, "service", 60, required=False) or "Standard"
            cost = _paise(row, "cost_per_500g", gt=0)
            eta = int(_num(row, "eta_days", minimum=0, integer=True))
            rating = _num(row, "rating", required=False, minimum=0)
            if rating is not None and rating > 5:
                raise RowError('"rating" must be between 0 and 5')
            cod_raw = (row.get("cod") or "").strip().lower()
            cod = cod_raw in ("1", "yes", "y", "true") if cod_raw else True
            key = (courier.lower(), service.lower())
            if key in seen:
                raise RowError(f"{courier} {service} appears more than once in this file")
        except RowError as e:
            fail(i, str(e))
            continue
        seen.add(key)
        q = ctx.db.scalar(select(LogisticsQuote).where(LogisticsQuote.business_id == ctx.business_id,
                                                       func.lower(LogisticsQuote.courier) == key[0],
                                                       func.lower(LogisticsQuote.service) == key[1]))
        vals = dict(cost_per_500g=cost, eta_days=eta, rating=rating if rating is not None else 0.0, cod=cod)
        if q is None:
            ctx.db.add(LogisticsQuote(id=new_id("LQ"), courier=courier, service=service, business_id=ctx.business_id, **vals))
            ctx.created += 1
        elif any(getattr(q, k) != v for k, v in vals.items()):
            for k, v in vals.items():
                setattr(q, k, v)
            ctx.updated += 1
        else:
            ctx.unchanged += 1


def _mandate(ctx: Ctx, rows: list[dict], fail: Callable[[int, str], None]) -> None:
    if len(rows) != 1:
        for i in range(3, len(rows) + 2):
            fail(i, "a mandate file has exactly one data row; extra rows were ignored")
    if not rows:
        return
    row = rows[0]
    try:
        vals = {"daily_budget": _paise(row, "daily_budget", gt=0), "max_order_value": _paise(row, "max_order_value", gt=0),
                "max_per_call_cost": _paise(row, "max_per_call_cost", gt=0)}
        if vals["max_order_value"] > vals["daily_budget"]:
            raise RowError("max_order_value can't be above daily_budget")
    except RowError as e:
        fail(2, str(e))
        return
    m = get_mandate(ctx.db, ctx.business_id)
    if any(getattr(m, k) != v for k, v in vals.items()):
        for k, v in vals.items():
            setattr(m, k, v)
        m.updated_at = datetime.now(timezone.utc)
        ctx.updated += 1
    else:
        ctx.unchanged += 1


WRITERS: dict[str, Callable[[Ctx, list[dict], Callable[[int, str], None]], None]] = {
    "products": _products, "sales": _sales, "returns": _returns, "supplier_quotes": _supplier_quotes,
    "logistics": _logistics, "mandate": _mandate,
}


# --------------------------------------------------------------------------- entry point

def out(b: ImportBatch, duplicate: bool = False) -> dict:
    return {"id": b.id, "dataset": b.dataset, "datasetLabel": DATASETS[b.dataset]["label"], "fileName": b.file_name,
            "sheet": b.sheet, "source": b.source, "status": b.status, "rowsTotal": b.rows_total, "created": b.rows_created,
            "updated": b.rows_updated, "unchanged": b.rows_unchanged, "failed": b.rows_failed,
            "imported": b.rows_created + b.rows_updated + b.rows_unchanged, "errors": b.errors,
            "createdAt": b.created_at.isoformat(), "duplicate": duplicate}


def _run_one(db: Session, business_id: int, user_id: Optional[int], user_name: str, dataset: str, rows: list[dict],
             file_name: str, sheet: Optional[str], digest: str, source: str) -> tuple[ImportBatch, bool]:
    existing_batch = db.scalar(select(ImportBatch).where(ImportBatch.business_id == business_id, ImportBatch.dataset == dataset,
                                                          ImportBatch.content_sha256 == digest))
    if existing_batch and existing_batch.status == "completed":
        return existing_batch, True
    errors: list[dict] = []
    failed = 0

    def fail(row: int, msg: str) -> None:
        nonlocal failed
        failed += 1
        if len(errors) < MAX_ERRORS:
            errors.append({"row": row, "message": msg})

    spec = DATASETS[dataset]
    cols = set(rows[0].keys()) if rows else set()

    # Dataset-specific column fallbacks
    if dataset == "products":
        if "stock" not in cols:
            for alt in ("units", "quantity", "qty", "inventory", "available"):
                if alt in cols:
                    for r in rows:
                        r["stock"] = r[alt]
                    cols.add("stock")
                    break
        if "price" not in cols and "unit_price" in cols:
            for r in rows:
                r["price"] = r["unit_price"]
            cols.add("price")
    elif dataset == "sales":
        if "units" not in cols:
            for alt in ("stock", "quantity", "qty", "volume"):
                if alt in cols:
                    for r in rows:
                        r["units"] = r[alt]
                    cols.add("units")
                    break
    elif dataset == "supplier_quotes":
        if "unit_price" not in cols and "price" in cols:
            for r in rows:
                r["unit_price"] = r["price"]
            cols.add("unit_price")
        if "delivery_days" not in cols and "eta_days" in cols:
            for r in rows:
                r["delivery_days"] = r["eta_days"]
            cols.add("delivery_days")
    elif dataset == "logistics":
        if "cost_per_500g" not in cols and "cost" in cols:
            for r in rows:
                r["cost_per_500g"] = r["cost"]
            cols.add("cost_per_500g")
        if "eta_days" not in cols and "delivery_days" in cols:
            for r in rows:
                r["eta_days"] = r["delivery_days"]
            cols.add("eta_days")

    missing = [c for c in spec["required"] if c not in cols]
    ctx = Ctx(db, business_id, user_name)
    if not rows:
        errors.append({"row": None, "message": "The file has no data rows."})
    elif len(rows) > MAX_ROWS:
        errors.append({"row": None, "message": f"The file has more than {MAX_ROWS:,} rows. Split it and import the parts."})
        failed = len(rows)
    elif missing:
        errors.append({"row": 1, "message": f"Missing required column{'s' if len(missing) > 1 else ''}: {', '.join(missing)}. "
                                            f"Expected: {', '.join(spec['required'])}."})
        failed = len(rows)
    else:
        WRITERS[dataset](ctx, rows, fail)
    ok = ctx.created + ctx.updated + ctx.unchanged
    if existing_batch:
        b = existing_batch
        b.status = "completed" if ok else "failed"
        b.rows_total = len(rows)
        b.rows_created = ctx.created
        b.rows_updated = ctx.updated
        b.rows_unchanged = ctx.unchanged
        b.rows_failed = failed
        b.errors = errors
    else:
        b = ImportBatch(id=new_id("IMP"), business_id=business_id, user_id=user_id, dataset=dataset, file_name=file_name[:200],
                        sheet=sheet[:100] if sheet else None, content_sha256=digest, source=source,
                        status="completed" if ok else "failed", rows_total=len(rows), rows_created=ctx.created,
                        rows_updated=ctx.updated, rows_unchanged=ctx.unchanged, rows_failed=failed, errors=errors)
        db.add(b)
    db.flush()
    log_activity(db, business_id, agent=f"Seller · {user_name}"[:80],
                 action=f"Imported {spec['label'].lower()}: {ok} of {len(rows)} rows"[:200],
                 status="success" if ok and not failed else "warning",
                 detail=f"{file_name}{f' / {sheet}' if sheet else ''} · {ctx.created} new, {ctx.updated} updated, "
                        f"{ctx.unchanged} unchanged, {failed} skipped · {b.id}", ref=b.id)
    return b, False


def import_file(db: Session, business_id: int, user_id: Optional[int], user_name: str, *, file_name: str, content: bytes,
                dataset: Optional[str] = None, source: str = "import_page") -> list[dict]:
    if not content:
        raise ApiError(422, "empty_file", "The file is empty.")
    if len(content) > MAX_BYTES:
        raise ApiError(413, "file_too_large", "Files can be at most 10 MB.")
    if dataset is not None and dataset not in DATASETS:
        raise ApiError(422, "unknown_dataset", "Unknown dataset.", field="dataset")
    name = file_name.lower()
    digest = hashlib.sha256(content).hexdigest()
    jobs: list[tuple[str, list[dict], Optional[str]]] = []
    if name.endswith(".csv"):
        rows = parse_csv(content)
        cols = list(rows[0].keys()) if rows else None
        ds = detect_dataset(name, cols) or dataset
        if not ds:
            raise ApiError(422, "unknown_dataset", "Couldn't tell which dataset this file is. Choose one, or name the file "
                                                   "like Products.csv, Sales_History.csv, Returns.csv or Supplier_Quotes.csv.")
        jobs.append((ds, rows, None))
    elif name.endswith(".xlsx"):
        sheets = parse_xlsx(content)
        for sheet, rows in sheets.items():
            cols = list(rows[0].keys()) if rows else None
            ds = detect_dataset(sheet, cols)
            if ds is None and dataset and len(sheets) == 1:
                ds = dataset
            if ds:
                jobs.append((ds, rows, sheet))
        if not jobs:
            if dataset and sheets:
                first_sheet = next(iter(sheets))
                jobs.append((dataset, sheets[first_sheet], first_sheet))
            else:
                raise ApiError(422, "no_matching_sheets", "No sheet matched a dataset. Name sheets Products, Sales, Returns, "
                                                          "Supplier Quotes, Logistics or Mandate.")
    else:
        raise ApiError(415, "unsupported_format", "Upload a .csv or .xlsx file.")
    jobs.sort(key=lambda j: ORDER.index(j[0]))
    results = []
    for ds, rows, sheet in jobs:
        sheet_digest = digest if sheet is None else hashlib.sha256(digest.encode() + sheet.encode()).hexdigest()
        b, dup = _run_one(db, business_id, user_id, user_name, ds, rows, file_name, sheet, sheet_digest, source)
        results.append(out(b, duplicate=dup))
    return results
