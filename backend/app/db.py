"""Database engine and session handling (SQLAlchemy 2).

SQLite locally. Hosted deployments use Postgres, because a serverless function
keeps no files between requests.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

# Any fixed number: every Postgres transaction takes this one advisory lock.
_WRITE_LOCK_ID = 7203


class Base(DeclarativeBase):
    pass


def _make_postgres_engine(url: str) -> Engine:
    # Hosting providers hand out postgres:// URLs; the driver is named explicitly here.
    url = url.replace("postgres://", "postgresql+psycopg://", 1).replace("postgresql://", "postgresql+psycopg://", 1)
    # No pool of our own, since functions come and go and the provider's pooler does this.
    # Prepared statements don't survive a transaction-mode pooler, so they stay off.
    engine = create_engine(url, poolclass=NullPool, connect_args={"prepare_threshold": None}, future=True)

    @event.listens_for(engine, "begin")
    def _on_begin(conn):  # pragma: no cover - driver hook
        # The same guarantee as SQLite's BEGIN IMMEDIATE below: transactions run one at a
        # time, so counter increments and wallet debits can't race, even across functions.
        conn.exec_driver_sql(f"SELECT pg_advisory_xact_lock({_WRITE_LOCK_ID})")

    return engine


def make_engine(url: str) -> Engine:
    if url.startswith("postgres"):
        return _make_postgres_engine(url)
    connect_args = {"check_same_thread": False, "timeout": 30} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, future=True)

    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _on_connect(dbapi_conn, _record):  # pragma: no cover - driver hook
            # Let SQLAlchemy control transactions explicitly so we can use
            # BEGIN IMMEDIATE, which serialises writers. That is what keeps
            # counter increments and wallet debits from racing each other.
            dbapi_conn.isolation_level = None
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            if ":memory:" not in url:
                cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

        @event.listens_for(engine, "begin")
        def _on_begin(conn):  # pragma: no cover - driver hook
            conn.exec_driver_sql("BEGIN IMMEDIATE")

    return engine


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def configure(url: str) -> None:
    """Point the app at another database (used by tests)."""
    global engine
    engine = make_engine(url)
    SessionLocal.configure(bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
