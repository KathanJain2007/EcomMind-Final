"""Scheduled and on-demand EcomMind agent runs."""
from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import db as dbmod
from ..config import settings
from ..db import get_db
from ..deps import current_business
from ..errors import ApiError
from ..models import AgentRun, Business
from ..services import agent_runner

router = APIRouter(prefix="/api", tags=["agent"])

# Keep in step with the "crons" entry in vercel.json (03:30 UTC = 09:00 IST).
SCHEDULE = {"cron": "30 3 * * *", "label": "Every day at about 9:00 AM IST"}
MANUAL_GAP = timedelta(seconds=15)


@router.get("/agent/runs")
def list_runs(limit: int = Query(default=10, ge=1, le=50), biz: Business = Depends(current_business),
              db: Session = Depends(get_db)):
    runs = db.scalars(select(AgentRun).where(AgentRun.business_id == biz.id)
                      .order_by(AgentRun.started_at.desc()).limit(limit)).all()
    return {"runs": [agent_runner.run_out(r) for r in runs], "schedule": {**SCHEDULE, "enabled": bool(settings.cron_secret)}}


@router.post("/agent/runs", status_code=201)
def run_now(biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    last = db.scalar(select(AgentRun.started_at).where(AgentRun.business_id == biz.id, AgentRun.trigger == "manual")
                     .order_by(AgentRun.started_at.desc()).limit(1))
    if last and datetime.now(timezone.utc) - last < MANUAL_GAP:
        raise ApiError(429, "run_too_soon", "A check just ran. Wait a few seconds before running another.")
    run = agent_runner.run_for_business(db, biz, "manual")
    db.commit()
    return {"run": agent_runner.run_out(run)}


@router.get("/cron/agent-runs")
def cron_agent_runs(request: Request):
    """Called by Vercel Cron with "Authorization: Bearer <CRON_SECRET>"."""
    if not settings.cron_secret:
        raise ApiError(503, "cron_not_configured", "Set CRON_SECRET to enable scheduled agent runs.")
    sent = request.headers.get("authorization", "")
    if not hmac.compare_digest(sent.encode(), f"Bearer {settings.cron_secret}".encode()):
        raise ApiError(401, "unauthorized", "Invalid cron secret.")
    return agent_runner.run_scheduled(dbmod.SessionLocal)
