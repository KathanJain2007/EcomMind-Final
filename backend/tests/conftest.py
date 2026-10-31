import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ["GOOGLE_MAPS_API_KEY"] = ""
os.environ["SMTP_HOST"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app import db as dbmod  # noqa: E402
from app.main import create_app  # noqa: E402

VALID_GSTIN = "27AAPFU0939F1ZV"


@pytest.fixture()
def client(tmp_path):
    dbmod.configure(f"sqlite:///{tmp_path / 'test.db'}")
    with TestClient(create_app()) as c:
        yield c


def register(client, email="seller.one@gmail.com", password="secret123", name="Asha Rao", business="Asha Store"):
    return client.post("/api/auth/register", json={"name": name, "business": business, "email": email,
                                                   "password": password, "category": "Electronics"})


@pytest.fixture()
def seller(client):
    r = register(client)
    assert r.status_code == 201, r.text
    r = client.post("/api/demo/load")
    assert r.status_code == 200, r.text
    return client


def key() -> str:
    return "test-" + uuid.uuid4().hex
