from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..config import settings
from ..deps import current_user
from ..services import places

router = APIRouter(prefix="/api/places", tags=["places"], dependencies=[Depends(current_user)])


@router.get("/config")
def places_config():
    return {"enabled": bool(settings.google_maps_api_key), "verificationRequired": settings.location_verification_required}


@router.get("/autocomplete")
def autocomplete(q: str = Query(min_length=1, max_length=120), sessionToken: str | None = Query(default=None, max_length=100)):
    return {"suggestions": places.autocomplete(q, sessionToken)}


@router.get("/details/{place_id}")
def details(place_id: str, sessionToken: str | None = Query(default=None, max_length=100)):
    return places.details(place_id, sessionToken)
