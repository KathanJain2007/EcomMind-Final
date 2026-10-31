"""Request dependencies: DB session, current user, idempotency key."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .errors import ApiError
from .models import AuthSession, Business, User
from .security import token_hash

SESSION_COOKIE = "ecommind_session"
_IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9_.:-]{8,80}$")


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise ApiError(401, "unauthorized", "Please sign in to continue.")
    sess = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash(token)))
    if not sess or _aware(sess.expires_at) < datetime.now(timezone.utc):
        raise ApiError(401, "session_expired", "Your session has ended. Please sign in again.")
    user = db.get(User, sess.user_id)
    if not user:
        raise ApiError(401, "unauthorized", "Please sign in to continue.")
    # End the read transaction now: SQLite transactions start with BEGIN
    # IMMEDIATE, and an idle one would block other writers until the request ends.
    db.commit()
    return user


def current_business(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Business:
    biz = db.scalar(select(Business).where(Business.owner_id == user.id))
    if not biz:
        raise ApiError(409, "business_missing", "Finish business onboarding first.")
    db.commit()
    return biz


def idempotency_key(idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> str:
    if not idempotency_key or not _IDEMPOTENCY_RE.match(idempotency_key):
        raise ApiError(400, "idempotency_key_required", "Send a unique Idempotency-Key header (8-80 characters) with this request.")
    return idempotency_key
