"""Google Places (New) proxy. The API key never leaves the server.

Autocomplete: POST https://places.googleapis.com/v1/places:autocomplete
Details:      GET  https://places.googleapis.com/v1/places/{place_id}

Uses session tokens so an autocomplete burst plus one details lookup is billed
as one session. Results are cached briefly to absorb repeated keystrokes.
"""
from __future__ import annotations

import time
from collections import OrderedDict

import httpx

from ..config import settings
from ..errors import ApiError

AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
DETAILS_FIELDS = "id,formattedAddress,location,addressComponents,displayName"

_CACHE_TTL = 300
_cache: OrderedDict[str, tuple[float, object]] = OrderedDict()

# Overridable in tests.
transport: httpx.BaseTransport | None = None


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL:
        _cache.move_to_end(key)
        return hit[1]
    _cache.pop(key, None)
    return None


def _cache_put(key: str, value: object) -> None:
    _cache[key] = (time.monotonic(), value)
    while len(_cache) > 500:
        _cache.popitem(last=False)


def _client() -> httpx.Client:
    return httpx.Client(timeout=settings.places_timeout_seconds, transport=transport)


def _check_configured() -> None:
    if not settings.google_maps_api_key:
        raise ApiError(503, "places_not_configured",
                       "Location search isn't set up on this server. Type your location instead.")


def _request(method: str, url: str, **kw) -> dict:
    headers = kw.pop("headers", {})
    headers["X-Goog-Api-Key"] = settings.google_maps_api_key
    try:
        with _client() as c:
            r = c.request(method, url, headers=headers, **kw)
    except httpx.TimeoutException:
        raise ApiError(504, "places_timeout", "Location search is taking too long. Try again in a moment.")
    except httpx.HTTPError:
        raise ApiError(503, "places_unavailable", "Location search is unavailable right now. Try again shortly.")
    if r.status_code == 429:
        raise ApiError(503, "places_rate_limited", "Too many location searches right now. Wait a few seconds and try again.",
                       headers={"Retry-After": r.headers.get("Retry-After", "5")})
    if r.status_code in (400, 404) and "places/" in url and "autocomplete" not in url:
        raise ApiError(404, "place_not_found", "That place couldn't be found. Pick another suggestion.")
    if r.status_code >= 400:
        # Covers invalid/blocked keys (403) and provider errors (5xx). The key is never echoed.
        raise ApiError(503, "places_unavailable", "Location search is unavailable right now. Try again shortly.")
    return r.json()


def autocomplete(query: str, session_token: str | None) -> list[dict]:
    q = query.strip()
    if len(q) < 2:
        return []
    _check_configured()
    key = f"ac:{q.lower()}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]
    body: dict = {"input": q, "languageCode": "en"}
    if settings.places_region_codes:
        body["includedRegionCodes"] = settings.places_region_codes
    if session_token:
        body["sessionToken"] = session_token
    data = _request("POST", AUTOCOMPLETE_URL, json=body)
    out = []
    for s in data.get("suggestions", []):
        p = s.get("placePrediction")
        if not p:
            continue
        fmt = p.get("structuredFormat", {})
        out.append({
            "placeId": p.get("placeId"),
            "primary": fmt.get("mainText", {}).get("text") or p.get("text", {}).get("text", ""),
            "secondary": fmt.get("secondaryText", {}).get("text", ""),
            "description": p.get("text", {}).get("text", ""),
        })
    _cache_put(key, out)
    return out


def details(place_id: str, session_token: str | None) -> dict:
    _check_configured()
    if not place_id or len(place_id) > 300 or any(ch in place_id for ch in "/?#"):
        raise ApiError(422, "invalid_place_id", "Invalid place id.")
    key = f"pd:{place_id}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]
    params = {"sessionToken": session_token} if session_token else None
    data = _request("GET", DETAILS_URL.format(place_id=place_id), params=params, headers={"X-Goog-FieldMask": DETAILS_FIELDS})
    comps = data.get("addressComponents", [])

    def comp(*types: str) -> str | None:
        for t in types:
            for c in comps:
                if t in c.get("types", []):
                    return c.get("longText")
        return None

    loc = data.get("location") or {}
    out = {
        "placeId": data.get("id", place_id),
        "formattedAddress": data.get("formattedAddress") or (data.get("displayName") or {}).get("text"),
        "name": (data.get("displayName") or {}).get("text"),
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "city": comp("locality", "administrative_area_level_3", "administrative_area_level_2", "postal_town"),
        "state": comp("administrative_area_level_1"),
        "country": comp("country"),
    }
    _cache_put(key, out)
    return out
