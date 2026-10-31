"""EcomMind API — run with:  uvicorn app.main:app --reload --port 8000  (from backend/)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db as dbmod
from . import errors
from .config import settings
from .migrations import migrate
from .routers import activity, analytics, auth, business, places, rfq, store
from .seed import seed_network

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# Request bodies and cookies are never logged; uvicorn's access log only prints method, path and status.


def init_db() -> None:
    migrate(dbmod.engine)
    with dbmod.SessionLocal() as s:
        seed_network(s)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="EcomMind API", version="0.1.0", lifespan=lifespan)
    errors.install(app)
    app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
    for r in (auth.router, business.router, places.router, store.router, rfq.router, analytics.router, activity.router):
        app.include_router(r)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    return app


app = create_app()
