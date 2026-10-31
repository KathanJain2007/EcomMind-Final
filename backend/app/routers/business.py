"""Business onboarding and profile (location + GSTIN). Owner-only."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import current_business, current_user
from ..errors import ApiError
from ..models import Business, User
from ..services import places
from ..validation.gstin import mask, validate_gstin
from .auth import user_out

router = APIRouter(prefix="/api/business", tags=["business"])


class LocationIn(BaseModel):
    text: str = Field(min_length=2, max_length=300)
    placeId: str | None = Field(default=None, max_length=300)
    sessionToken: str | None = Field(default=None, max_length=100)


class OnboardingIn(BaseModel):
    business: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    currency: str = Field(default="INR", max_length=8)
    channel: str = Field(min_length=1, max_length=40)
    businessType: str | None = Field(default=None, max_length=60)
    location: LocationIn
    gstin: str = Field(max_length=40)


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    category: str | None = Field(default=None, max_length=80)
    channel: str | None = Field(default=None, max_length=40)
    businessType: str | None = Field(default=None, max_length=60)
    location: LocationIn | None = None
    gstin: str | None = Field(default=None, max_length=40)


def _apply_location(biz: Business, loc: LocationIn) -> None:
    """Verified when a Google place id resolves; otherwise stored as typed and marked unverified."""
    if loc.placeId:
        try:
            d = places.details(loc.placeId, loc.sessionToken)
        except ApiError as e:
            if e.code == "place_not_found" or settings.location_verification_required:
                raise ApiError(422, "location_unverified", "Pick your location from the suggestions list.", field="location")
            d = None  # provider hiccup: keep what the user picked, unverified
        if d:
            biz.location_text = d["formattedAddress"] or loc.text
            biz.location_place_id, biz.location_lat, biz.location_lng = d["placeId"], d["lat"], d["lng"]
            biz.location_city, biz.location_state, biz.location_country = d["city"], d["state"], d["country"]
            biz.location_verified = True
            return
    elif settings.location_verification_required:
        raise ApiError(422, "location_unverified", "Pick your location from the suggestions list.", field="location")
    biz.location_text = loc.text.strip()
    biz.location_place_id = biz.location_lat = biz.location_lng = None
    biz.location_city = biz.location_state = biz.location_country = None
    biz.location_verified = False


def _apply_gstin(db: Session, biz: Business, raw: str) -> None:
    res = validate_gstin(raw)
    if not res.ok:
        raise ApiError(422, res.code, res.message, field="gstin")
    other = db.scalar(select(Business.id).where(Business.gstin == res.gstin, Business.id != biz.id))
    if other:
        raise ApiError(409, "gstin_taken", "This GSTIN is already linked to another EcomMind business.", field="gstin")
    if biz.gstin != res.gstin:
        biz.gstin = res.gstin
        biz.gstin_status = "format_validated"
        biz.gstin_updated_at = datetime.now(timezone.utc)


def profile_out(biz: Business) -> dict:
    return {
        "id": biz.id, "name": biz.name, "category": biz.category, "currency": biz.currency, "channel": biz.channel,
        "businessType": biz.business_type, "onboarded": biz.onboarded,
        "location": {
            "text": biz.location_text, "placeId": biz.location_place_id, "lat": biz.location_lat, "lng": biz.location_lng,
            "city": biz.location_city, "state": biz.location_state, "country": biz.location_country,
            "verified": biz.location_verified,
        } if biz.location_text else None,
        "gstin": biz.gstin,  # full value: this endpoint is owner-only
        "gstinMasked": mask(biz.gstin),
        "gstinStatus": biz.gstin_status,
        "gstinNote": "Format validated only. EcomMind hasn't checked this GSTIN with the GST portal." if biz.gstin else None,
        "gstinUpdatedAt": biz.gstin_updated_at.isoformat() if biz.gstin_updated_at else None,
    }


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "gstin_taken", "This GSTIN is already linked to another EcomMind business.", field="gstin")


@router.put("/onboarding")
def onboarding(body: OnboardingIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    biz = db.scalar(select(Business).where(Business.owner_id == user.id))
    if not biz:
        biz = Business(owner_id=user.id, name=body.business.strip())
        db.add(biz)
        db.flush()
    _apply_gstin(db, biz, body.gstin)
    _apply_location(biz, body.location)
    biz.name = body.business.strip()
    biz.category, biz.channel = body.category, body.channel
    biz.business_type = body.businessType
    biz.currency = "USD" if body.currency.upper().startswith("USD") else "INR"
    biz.onboarded = True
    _commit(db)
    return user_out(user, biz)


@router.get("/profile")
def get_profile(biz: Business = Depends(current_business)):
    return profile_out(biz)


@router.patch("/profile")
def patch_profile(body: ProfilePatch, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    biz = db.merge(biz)
    if body.name is not None:
        biz.name = body.name.strip()
    if body.category is not None:
        biz.category = body.category
    if body.channel is not None:
        biz.channel = body.channel
    if body.businessType is not None:
        biz.business_type = body.businessType
    if body.location is not None:
        _apply_location(biz, body.location)
    if body.gstin is not None:
        _apply_gstin(db, biz, body.gstin)
    _commit(db)
    return profile_out(biz)
