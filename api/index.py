"""Vercel entry point: serves the FastAPI app as one function. vercel.json sends /api/* here."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

# Fail loudly instead of running with a public signing key or a database that vanishes.
for name in ("SECRET_KEY", "DATABASE_URL"):
    if not os.environ.get(name):
        raise RuntimeError(f"{name} must be set in the Vercel project's environment variables.")
if not os.environ["DATABASE_URL"].startswith("postgres"):
    raise RuntimeError("DATABASE_URL must be a Postgres URL: a function keeps no files between requests.")

from app.main import app, init_db  # noqa: E402

# Safe to repeat on every cold start: tables and seed data are only added when missing.
init_db()

__all__ = ["app"]
