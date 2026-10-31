"""Tiny, additive migration runner.

create_all() creates missing tables but never alters existing ones, so each
column added after a database already exists gets a numbered migration here.
Migrations only ADD — they never drop tables or rewrite seller records.
"""
from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine

from . import models  # noqa: F401  (registers tables)
from .db import Base


def _add_column(conn: Connection, table: str, column: str, ddl: str) -> None:
    cols = {c["name"] for c in inspect(conn).get_columns(table)}
    if column not in cols:
        conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def _m1_gstin_and_location(conn: Connection) -> None:
    # Older databases (created before GSTIN / location support) get the new
    # nullable columns. Existing sellers keep working with GSTIN unset.
    for column, ddl in [
        ("gstin", "VARCHAR(15)"),
        ("gstin_status", "VARCHAR(32)"),
        ("gstin_updated_at", "DATETIME"),
        ("location_text", "VARCHAR(300)"),
        ("location_place_id", "VARCHAR(300)"),
        ("location_lat", "FLOAT"),
        ("location_lng", "FLOAT"),
        ("location_city", "VARCHAR(120)"),
        ("location_state", "VARCHAR(120)"),
        ("location_country", "VARCHAR(120)"),
        ("location_verified", "BOOLEAN DEFAULT 0"),
    ]:
        _add_column(conn, "businesses", column, ddl)
    conn.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_businesses_gstin ON businesses (gstin) WHERE gstin IS NOT NULL"
    )


def _m2_wallet_daily_limit(conn: Connection) -> None:
    _add_column(conn, "mandates", "wallet_daily_limit", "INTEGER DEFAULT 100000")


def _m3_business_type(conn: Connection) -> None:
    _add_column(conn, "businesses", "business_type", "VARCHAR(60)")


def _m4_escrow(conn: Connection) -> None:
    # escrows / stock_movements are new tables (created by create_all).
    _add_column(conn, "wallet_txns", "gross_amount", "INTEGER")
    # A second lock, release or refund for the same escrow is impossible at the
    # database level, not just in application code.
    conn.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_escrow_entry ON wallet_txns (ref, kind) "
        "WHERE kind IN ('escrow_lock', 'escrow_release', 'refund')"
    )


def _m5_repricing(conn: Connection) -> None:
    # price_changes is a new table (created by create_all).
    _add_column(conn, "mandates", "max_discount_pct", "FLOAT DEFAULT 25")
    _add_column(conn, "mandates", "pricing_mode", "VARCHAR(16) DEFAULT 'recommendation'")
    conn.exec_driver_sql("UPDATE mandates SET pricing_mode = 'autonomous' WHERE auto_repricing = 1")


def _m6_marketplace(conn: Connection) -> None:
    # marketplace_listings / marketplace_orders are new tables (created by create_all).
    # Existing products get an opening-stock movement so the stock history adds up.
    conn.exec_driver_sql(
        "INSERT INTO stock_movements (business_id, sku, delta, resulting_stock, kind, channel, reason, ref, created_at) "
        "SELECT p.business_id, p.sku, p.stock, p.stock, 'opening', NULL, 'Opening stock', NULL, CURRENT_TIMESTAMP "
        "FROM products p WHERE NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.business_id = p.business_id AND m.sku = p.sku)"
    )


def _m7_approvals(conn: Connection) -> None:
    # approvals is a new table (created by create_all).
    _add_column(conn, "mandates", "autonomy_level", "INTEGER DEFAULT 2")
    # The same proposal can't be pending twice.
    conn.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_approvals_pending ON approvals (business_id, dedupe_key) "
        "WHERE status = 'pending' AND dedupe_key IS NOT NULL"
    )


MIGRATIONS: list[tuple[int, Callable[[Connection], None]]] = [
    (1, _m1_gstin_and_location),
    (2, _m2_wallet_daily_limit),
    (3, _m3_business_type),
    (4, _m4_escrow),
    (5, _m5_repricing),
    (6, _m6_marketplace),
    (7, _m7_approvals),
]


def migrate(engine: Engine) -> int:
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        applied = {row[0] for row in conn.execute(text("SELECT version FROM schema_version"))}
        for version, fn in MIGRATIONS:
            if version in applied:
                continue
            fn(conn)
            conn.execute(text("INSERT INTO schema_version (version, applied_at) VALUES (:v, CURRENT_TIMESTAMP)"), {"v": version})
    return max(v for v, _ in MIGRATIONS)
