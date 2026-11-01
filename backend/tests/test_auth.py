import logging

from conftest import register


def test_register_and_login_with_gmail(client):
    r = register(client, email="  Seller.One@GMAIL.com ")
    assert r.status_code == 201
    assert r.json()["user"]["email"] == "seller.one@gmail.com"
    assert "ecommind_session" in r.cookies or client.cookies.get("ecommind_session")

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401

    r = client.post("/api/auth/login", json={"email": "SELLER.ONE@gmail.com", "password": "secret123"})
    assert r.status_code == 200, r.text
    assert client.get("/api/auth/me").json()["user"]["email"] == "seller.one@gmail.com"


def test_register_rejects_non_gmail_even_without_frontend(client):
    for email in ["asha@yahoo.com", "asha@outlook.com", "asha@hotmail.com", "asha@urbannest.in"]:
        r = register(client, email=email)
        assert r.status_code == 422
        err = r.json()["error"]
        assert err == {"code": "unsupported_email_domain", "field": "email",
                       "message": "Only Gmail addresses ending in @gmail.com are accepted."}


def test_register_rejects_bad_format(client):
    r = register(client, email="not an email")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_email"
    assert r.json()["error"]["message"] == "Please enter a valid email address."


def test_duplicate_registration_by_normalised_email(client):
    assert register(client, email="seller.one@gmail.com").status_code == 201
    client.post("/api/auth/logout")
    for dup in ["SELLER.ONE@gmail.com", " seller.one@GMAIL.COM ", "sellerone@gmail.com", "seller.one+shop@gmail.com"]:
        r = register(client, email=dup)
        assert r.status_code == 409, dup
        assert r.json()["error"]["code"] == "email_taken"


def test_login_uses_same_rules(client):
    register(client)
    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"email": "seller.one@yahoo.com", "password": "secret123"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_email_domain"
    r = client.post("/api/auth/login", json={"email": "seller one@gmail.com", "password": "secret123"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_email"
    r = client.post("/api/auth/login", json={"email": "seller.one@gmail.com", "password": "wrong-pass"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    r = client.post("/api/auth/login", json={"email": "nobody.here@gmail.com", "password": "secret123"})
    assert r.status_code == 401


def test_password_not_stored_or_logged(client, caplog):
    caplog.set_level(logging.DEBUG)
    register(client, password="Sup3r-Secret-Pw")
    client.post("/api/auth/login", json={"email": "seller.one@gmail.com", "password": "Sup3r-Secret-Pw"})
    assert "Sup3r-Secret-Pw" not in caplog.text
    session_cookie = client.cookies.get("ecommind_session")
    assert session_cookie and session_cookie not in caplog.text
    from app import db as dbmod
    from app.models import AuthSession, User
    with dbmod.SessionLocal() as s:
        u = s.query(User).one()
        assert (u.password_hash.startswith("scrypt$") or u.password_hash.startswith("pbkdf2$")) and "Sup3r" not in u.password_hash
        assert all(sess.token_hash != session_cookie for sess in s.query(AuthSession))


def test_validation_errors_do_not_echo_password(client):
    r = client.post("/api/auth/register", json={"name": "A", "business": "B", "email": "seller.one@gmail.com", "password": "x" * 200})
    assert r.status_code == 422
    assert "xxxxxxxx" not in r.text


def test_email_verification_does_not_pretend_to_send(client):
    register(client)
    r = client.post("/api/auth/verification/send")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "email_provider_not_configured"
    assert "no code was sent" in r.json()["error"]["message"]


def test_email_verification_with_provider(client, monkeypatch):
    from app.config import settings
    from app.services import email_sender
    sent = {}
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_from", "noreply@example.test")
    monkeypatch.setattr(email_sender, "deliver", lambda msg: sent.update(body=msg.get_content(), to=msg["To"]))
    register(client)
    assert client.post("/api/auth/verification/send").json()["sent"] is True
    code = sent["body"].split("code is ")[1][:6]
    assert client.post("/api/auth/verification/confirm", json={"code": "000000" if code != "000000" else "111111"}).status_code == 400
    assert client.post("/api/auth/verification/confirm", json={"code": code}).json() == {"verified": True}
    assert client.get("/api/auth/me").json()["user"]["emailVerified"] is True


def test_demo_login(client):
    r = client.post("/api/auth/demo")
    assert r.status_code == 200
    assert r.json()["business"]["demoLoaded"] is True
    assert r.json()["user"]["name"] == "John Doe"
    assert r.json()["user"]["isDemo"] is True


def test_demo_login_renames_an_existing_demo_account_and_keeps_its_data(client):
    client.post("/api/auth/demo")
    products = client.get("/api/products").json()
    assert products
    from app import db as dbmod
    from app.models import User
    with dbmod.SessionLocal() as s:
        s.query(User).filter(User.is_demo).one().name = "Aarav Sharma"
        s.commit()
    client.post("/api/auth/logout")

    r = client.post("/api/auth/demo")
    assert r.json()["user"]["name"] == "John Doe"
    assert client.get("/api/products").json() == products


def test_session_endpoint(client):
    assert client.get("/api/auth/session").json() == {"authenticated": False}
    register(client)
    body = client.get("/api/auth/session").json()
    assert body["authenticated"] is True and body["user"]["email"] == "seller.one@gmail.com"


def test_short_gmail_username_is_accepted(client):
    r = client.post("/api/auth/register", json={"name": "Aryan", "business": "Aryan Traders", "email": "aryan@gmail.com",
                                                "password": "secret-pass", "category": "Fashion"})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email"] == "aryan@gmail.com"


def test_register_saves_location_and_gstin(client):
    r = client.post("/api/auth/register", json={"name": "Asha", "business": "Asha Traders", "email": "asharao77@gmail.com", "password": "secret-pass",
                                                "location": "Bengaluru, Karnataka, India", "gstin": "27aapfu0939f1zv"})
    assert r.status_code == 201, r.text
    p = client.get("/api/business/profile").json()
    assert p["location"]["text"] == "Bengaluru, Karnataka, India" and p["location"]["verified"] is False
    assert p["gstin"] == "27AAPFU0939F1ZV"


def test_register_with_bad_gstin_creates_nothing(client):
    body = {"name": "Asha", "business": "Asha Traders", "email": "asharao78@gmail.com", "password": "secret-pass"}
    r = client.post("/api/auth/register", json={**body, "gstin": "27ABCDE1234F1Z5"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "gstin_checksum"
    assert client.post("/api/auth/register", json=body).status_code == 201  # the email wasn't used up
