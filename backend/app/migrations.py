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


MIGRATIONS: list[tuple[int, Callable[[Connection], None]]] = [
    (1, _m1_gstin_and_location),
    (2, _m2_wallet_daily_limit),
    (3, _m3_business_type),
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
