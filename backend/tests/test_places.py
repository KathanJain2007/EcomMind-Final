import httpx
import pytest

from app.config import settings
from app.services import places
from conftest import VALID_GSTIN, register


@pytest.fixture()
def google(monkeypatch):
    calls = []

    def handler(req: httpx.Request):
        calls.append(req)
        assert req.headers["X-Goog-Api-Key"] == "test-key"
        if req.url.path.endswith(":autocomplete"):
            q = req.read().decode()
            if '"input":"slow"' in q.replace(" ", ""):
                raise httpx.ReadTimeout("slow")
            if '"input":"busy"' in q.replace(" ", ""):
                return httpx.Response(429, json={})
            return httpx.Response(200, json={"suggestions": [{"placePrediction": {
                "placeId": "ChIJkora", "text": {"text": "Koramangala, Bengaluru, Karnataka, India"},
                "structuredFormat": {"mainText": {"text": "Koramangala"}, "secondaryText": {"text": "Bengaluru, Karnataka, India"}}}}]})
        if req.url.path.endswith("/places/ChIJkora"):
            return httpx.Response(200, json={
                "id": "ChIJkora", "formattedAddress": "Koramangala, Bengaluru, Karnataka, India",
                "displayName": {"text": "Koramangala"}, "location": {"latitude": 12.9352, "longitude": 77.6245},
                "addressComponents": [
                    {"longText": "Bengaluru", "types": ["locality", "political"]},
                    {"longText": "Karnataka", "types": ["administrative_area_level_1", "political"]},
                    {"longText": "India", "types": ["country", "political"]}]})
        return httpx.Response(404, json={})

    monkeypatch.setattr(settings, "google_maps_api_key", "test-key")
    monkeypatch.setattr(places, "transport", httpx.MockTransport(handler))
    places._cache.clear()
    return calls


def test_autocomplete_and_cache(client, google):
    register(client)
    r = client.get("/api/places/autocomplete", params={"q": "Kor", "sessionToken": "s1"})
    assert r.status_code == 200
    assert r.json()["suggestions"][0]["primary"] == "Koramangala"
    client.get("/api/places/autocomplete", params={"q": "kor"})
    assert len(google) == 1  # second, same-text query served from cache
    assert "test-key" not in r.text


def test_provider_failures_are_graceful(client, google):
    register(client)
    r = client.get("/api/places/autocomplete", params={"q": "slow"})
    assert r.status_code == 504 and r.json()["error"]["code"] == "places_timeout"
    r = client.get("/api/places/autocomplete", params={"q": "busy"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "places_rate_limited"


def test_not_configured(client):
    register(client)
    r = client.get("/api/places/autocomplete", params={"q": "Ben"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "places_not_configured"


def test_selected_place_saved_to_profile(client, google):
    register(client)
    r = client.put("/api/business/onboarding", json={
        "business": "Asha Store", "category": "Electronics", "channel": "Amazon", "gstin": VALID_GSTIN,
        "location": {"text": "Koramangala", "placeId": "ChIJkora", "sessionToken": "s1"}})
    assert r.status_code == 200, r.text
    loc = client.get("/api/business/profile").json()["location"]
    assert loc == {"text": "Koramangala, Bengaluru, Karnataka, India", "placeId": "ChIJkora", "lat": 12.9352, "lng": 77.6245,
                   "city": "Bengaluru", "state": "Karnataka", "country": "India", "verified": True}


def test_verification_required_rejects_free_text(client, monkeypatch):
    monkeypatch.setattr(settings, "location_verification_required", True)
    register(client)
    r = client.put("/api/business/onboarding", json={
        "business": "Asha Store", "category": "Electronics", "channel": "Amazon", "gstin": VALID_GSTIN,
        "location": {"text": "somewhere I typed"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "location_unverified"


def test_requires_login(client):
    assert client.get("/api/places/autocomplete", params={"q": "Ben"}).status_code == 401
