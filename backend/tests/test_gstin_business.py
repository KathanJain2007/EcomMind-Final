import pytest

from app.validation.gstin import checksum_char, mask, validate_gstin
from conftest import VALID_GSTIN, register

# Real, publicly listed GSTINs used only as checksum fixtures.
VALID = ["27AAPFU0939F1ZV", "29AAGCB7383J1Z4", "33AAACH7409R1Z8"]


@pytest.mark.parametrize("g", VALID)
def test_valid_gstins(g):
    assert validate_gstin(g).ok


def test_normalises_spaces_and_case():
    r = validate_gstin("  27aapfu 0939f1zv ")
    assert r.ok and r.gstin == "27AAPFU0939F1ZV"


@pytest.mark.parametrize("raw, code", [
    ("", "gstin_required"),
    ("27AAPFU0939F1Z", "gstin_length"),
    ("27AAPFU0939F1ZV1", "gstin_length"),
    ("27AAPFU0939F1Z-", "gstin_characters"),
    ("00AAPFU0939F1ZV", "gstin_state_code"),
    ("45AAPFU0939F1ZV", "gstin_state_code"),
    ("271APFU0939F1ZV", "gstin_pan"),
    ("27AAPFU0939F0ZV", "gstin_entity_code"),
    ("27AAPFU0939F1YV", "gstin_default_char"),
    ("27AAPFU0939F1ZA", "gstin_checksum"),     # one wrong check character
])
def test_invalid_gstins(raw, code):
    assert validate_gstin(raw).code == code


def test_checksum_and_mask():
    assert checksum_char("27AAPFU0939F1Z") == "V"
    assert mask("27AAPFU0939F1ZV") == "27AAP*******1ZV"


def onboard(client, gstin=VALID_GSTIN, **loc):
    return client.put("/api/business/onboarding", json={
        "business": "Asha Store", "category": "Electronics & Accessories", "currency": "INR (₹)", "channel": "Amazon",
        "location": {"text": "Koramangala, Bengaluru", **loc}, "gstin": gstin})


def test_onboarding_stores_gstin_and_masks_it_in_session(client):
    register(client)
    r = onboard(client, gstin=" 27aapfu0939f1zv ")
    assert r.status_code == 200, r.text
    me = client.get("/api/auth/me").json()
    assert me["business"]["gstinMasked"] == "27AAP*******1ZV"
    assert "27AAPFU0939F1ZV" not in str(me)
    prof = client.get("/api/business/profile").json()
    assert prof["gstin"] == "27AAPFU0939F1ZV" and prof["gstinStatus"] == "format_validated"
    assert "Format validated only" in prof["gstinNote"]


def test_onboarding_rejects_invalid_gstin(client):
    register(client)
    r = onboard(client, gstin="27AAPFU0939F1ZA")
    assert r.status_code == 422 and r.json()["error"]["code"] == "gstin_checksum"
    assert client.get("/api/auth/me").json()["business"]["onboarded"] is False


def test_duplicate_gstin_rejected(client):
    register(client)
    assert onboard(client).status_code == 200
    client.post("/api/auth/logout")
    register(client, email="second.seller@gmail.com")
    r = onboard(client)
    assert r.status_code == 409 and r.json()["error"]["code"] == "gstin_taken"


def test_existing_users_without_gstin_still_work(client):
    register(client)
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/business/profile").json()["gstin"] is None
    assert client.patch("/api/business/profile", json={"gstin": VALID_GSTIN}).json()["gstin"] == VALID_GSTIN


def test_profile_requires_login(client):
    assert client.get("/api/business/profile").status_code == 401
    assert client.patch("/api/business/profile", json={"gstin": VALID_GSTIN}).status_code == 401


def test_unverified_location_saved_when_places_not_configured(client):
    register(client)
    onboard(client)
    loc = client.get("/api/business/profile").json()["location"]
    assert loc["text"] == "Koramangala, Bengaluru" and loc["verified"] is False


def test_migration_adds_columns_to_old_database(tmp_path):
    """An older businesses table without GSTIN/location columns is upgraded in place."""
    import sqlite3

    from app.db import make_engine
    from app.migrations import migrate

    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR, email_canonical VARCHAR UNIQUE, password_hash VARCHAR,
                            name VARCHAR, email_verified BOOLEAN, is_demo BOOLEAN, created_at DATETIME);
        CREATE TABLE businesses (id INTEGER PRIMARY KEY, owner_id INTEGER UNIQUE, name VARCHAR, category VARCHAR,
                                 currency VARCHAR, channel VARCHAR, onboarded BOOLEAN, demo_loaded BOOLEAN,
                                 agent_status VARCHAR, plan VARCHAR, created_at DATETIME);
        INSERT INTO users VALUES (1, 'old.seller@gmail.com', 'oldseller@gmail.com', 'x', 'Old', 0, 0, '2026-01-01');
        INSERT INTO businesses VALUES (1, 1, 'Old Shop', NULL, 'INR', NULL, 1, 0, 'active', 'Growth Plan', '2026-01-01');
    """)
    con.commit()
    con.close()
    migrate(make_engine(f"sqlite:///{path}"))
    con = sqlite3.connect(path)
    cols = {r[1] for r in con.execute("PRAGMA table_info(businesses)")}
    assert {"gstin", "gstin_status", "location_place_id", "location_verified"} <= cols
    assert con.execute("SELECT name, gstin FROM businesses").fetchone() == ("Old Shop", None)


def test_business_type_saved(client):
    register(client)
    r = client.put("/api/business/onboarding", json={"business": "Asha Store", "category": "Electronics", "channel": "Amazon",
                   "businessType": "Partnership", "gstin": VALID_GSTIN, "location": {"text": "Jaipur"}})
    assert r.status_code == 200 and r.json()["business"]["businessType"] == "Partnership"


def test_any_holder_type_with_a_correct_check_digit_is_valid():
    from app.validation.gstin import checksum_char, validate_gstin
    for holder in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        first14 = f"27AAB{holder}B1234D1Z"
        assert validate_gstin(first14 + checksum_char(first14)).ok, holder


def test_wrong_check_digit_is_still_rejected():
    from app.validation.gstin import validate_gstin
    assert validate_gstin("27ABCDE1234F1Z5").code == "gstin_checksum"
