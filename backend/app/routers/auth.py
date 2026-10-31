"""Registration, login, logout, session lookup and optional email verification."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import SESSION_COOKIE, current_user
from ..errors import ApiError
from ..models import AuthSession, Business, EmailVerification, User
from ..security import DUMMY_HASH, hash_password, new_token, token_hash, verify_password
from ..seed import ensure_mandate, load_demo_business
from ..services import email_sender
from ..validation.email import validate_gmail
from ..validation.gstin import mask

log = logging.getLogger("ecommind.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

PASSWORD_MIN, PASSWORD_MAX = 6, 128
DEMO_EMAIL = "ecommind.demo.seller@gmail.com"


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    business: str = Field(min_length=1, max_length=160)
    email: str = Field(max_length=400)
    password: str = Field(max_length=PASSWORD_MAX)
    category: str | None = Field(default=None, max_length=80)


class LoginIn(BaseModel):
    email: str = Field(max_length=400)
    password: str = Field(max_length=PASSWORD_MAX)


class CodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def _check_email(raw: str):
    res = validate_gmail(raw)
    if not res.ok:
        raise ApiError(422, res.code, res.message, field="email")
    return res


def _start_session(db: Session, response: Response, user: User) -> None:
    token = new_token()
    db.add(AuthSession(user_id=user.id, token_hash=token_hash(token),
                       expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_days)))
    db.commit()
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax", secure=settings.cookie_secure,
                        max_age=settings.session_days * 86400, path="/")


def user_out(user: User, biz: Business | None) -> dict:
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email, "emailVerified": user.email_verified, "isDemo": user.is_demo},
        "business": None if not biz else {
            "id": biz.id, "name": biz.name, "category": biz.category, "currency": biz.currency, "channel": biz.channel,
            "onboarded": biz.onboarded, "demoLoaded": biz.demo_loaded, "agentStatus": biz.agent_status, "plan": biz.plan,
            "location": {"text": biz.location_text, "city": biz.location_city, "state": biz.location_state,
                         "country": biz.location_country, "verified": biz.location_verified} if biz.location_text else None,
            # Only a masked GSTIN travels with the session; the full value needs GET /api/business/profile.
            "gstinMasked": mask(biz.gstin), "gstinStatus": biz.gstin_status,
        },
        "verification": {"mode": settings.email_verification, "providerConfigured": settings.email_provider_configured},
    }


@router.post("/register", status_code=201)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    email = _check_email(body.email)
    if len(body.password) < PASSWORD_MIN:
        raise ApiError(422, "weak_password", f"Password must be at least {PASSWORD_MIN} characters.", field="password")
    if not body.name.strip():
        raise ApiError(422, "invalid_name", "Enter your full name.", field="name")
    if not body.business.strip():
        raise ApiError(422, "invalid_business", "Enter your business name.", field="business")
    if db.scalar(select(User.id).where(User.email_canonical == email.canonical)):
        raise ApiError(409, "email_taken", "An account with this Gmail address already exists. Sign in instead.", field="email")
    user = User(email=email.email, email_canonical=email.canonical, password_hash=hash_password(body.password), name=body.name.strip())
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # lost a race with a parallel registration
        db.rollback()
        raise ApiError(409, "email_taken", "An account with this Gmail address already exists. Sign in instead.", field="email")
    biz = Business(owner_id=user.id, name=body.business.strip(), category=body.category)
    db.add(biz)
    db.flush()
    ensure_mandate(db, biz)
    db.commit()
    log.info("user registered id=%s", user.id)
    _start_session(db, response, user)
    return user_out(user, biz)


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    email = _check_email(body.email)  # same rules as registration
    user = db.scalar(select(User).where(User.email_canonical == email.canonical))
    # Verify against a dummy hash for unknown users so timing doesn't reveal which emails exist.
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        raise ApiError(401, "invalid_credentials", "Incorrect email or password.")
    # With EMAIL_VERIFICATION=required the session still starts; the frontend
    # sends unverified users to the verification step using `verification`.
    _start_session(db, response, user)
    log.info("user login id=%s", user.id)
    return user_out(user, user.business)


@router.post("/demo")
def demo_login(response: Response, db: Session = Depends(get_db)):
    res = validate_gmail(DEMO_EMAIL)
    user = db.scalar(select(User).where(User.email_canonical == res.canonical))
    if not user:
        # Random, never-disclosed password: the demo account is reachable only through this button.
        user = User(email=res.email, email_canonical=res.canonical, password_hash=hash_password(secrets.token_urlsafe(24)),
                    name="Aarav Sharma", is_demo=True)
        db.add(user)
        db.flush()
        biz = Business(owner_id=user.id, name="UrbanNest Living", category="Home & Kitchen", channel="Amazon",
                       onboarded=True, location_text="Jaipur, Rajasthan, India", location_city="Jaipur",
                       location_state="Rajasthan", location_country="India")
        db.add(biz)
        db.flush()
        ensure_mandate(db, biz)
        db.commit()
    biz = user.business or db.scalar(select(Business).where(Business.owner_id == user.id))
    if not biz.demo_loaded:
        load_demo_business(db, biz, user)
    _start_session(db, response, user)
    return user_out(user, biz)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sess = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash(token)))
        if sess:
            db.delete(sess)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return Response(status_code=204)


@router.get("/session")
def session(request: Request, db: Session = Depends(get_db)):
    """Like /me, but answers 200 with `authenticated: false` when signed out, so
    the app's start-up check doesn't log a 401 in the browser console."""
    try:
        user = current_user(request, db)
    except ApiError:
        return {"authenticated": False}
    biz = db.scalar(select(Business).where(Business.owner_id == user.id))
    return {"authenticated": True, **user_out(user, biz)}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    biz = db.scalar(select(Business).where(Business.owner_id == user.id))
    return user_out(user, biz)


# --------------------------------------------------------------------------- email verification (optional OTP)

@router.get("/verification")
def verification_status(user: User = Depends(current_user)):
    return {"mode": settings.email_verification, "providerConfigured": settings.email_provider_configured,
            "verified": user.email_verified}


@router.post("/verification/send")
def send_code(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if settings.email_verification == "off":
        raise ApiError(404, "verification_disabled", "Email verification is turned off on this server.")
    if user.email_verified:
        return {"sent": False, "alreadyVerified": True}
    if not settings.email_provider_configured:
        raise ApiError(503, "email_provider_not_configured",
                       "Email verification isn't available yet: no email provider is configured on this server, so no code was sent.")
    recent = db.scalar(select(EmailVerification).where(EmailVerification.user_id == user.id)
                       .order_by(EmailVerification.id.desc()))
    now = datetime.now(timezone.utc)
    if recent and (now - recent.created_at.replace(tzinfo=recent.created_at.tzinfo or timezone.utc)).total_seconds() < 60:
        raise ApiError(429, "verification_rate_limited", "Wait a minute before requesting another code.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(EmailVerification(user_id=user.id, code_hash=token_hash(code), expires_at=now + timedelta(minutes=10)))
    db.commit()
    try:
        email_sender.send_verification_code(user.email, code)
    except email_sender.EmailSendFailed:
        raise ApiError(502, "email_send_failed", "We couldn't send the verification email. Try again later.")
    return {"sent": True, "expiresInSeconds": 600}


@router.post("/verification/confirm")
def confirm_code(body: CodeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rec = db.scalar(select(EmailVerification).where(EmailVerification.user_id == user.id, EmailVerification.consumed.is_(False))
                    .order_by(EmailVerification.id.desc()))
    now = datetime.now(timezone.utc)
    if not rec:
        raise ApiError(400, "no_code", "Request a verification code first.")
    expires = rec.expires_at if rec.expires_at.tzinfo else rec.expires_at.replace(tzinfo=timezone.utc)
    if expires < now or rec.attempts >= 5:
        raise ApiError(400, "code_expired", "This code has expired. Request a new one.")
    rec.attempts += 1
    if not secrets.compare_digest(rec.code_hash, token_hash(body.code)):
        db.commit()
        raise ApiError(400, "code_invalid", "That code isn't correct.", field="code")
    rec.consumed = True
    user.email_verified = True
    db.commit()
    return {"verified": True}
