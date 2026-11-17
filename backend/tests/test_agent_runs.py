from datetime import timedelta

import pytest

from app.config import settings
from app.routers import agent as agent_router

from conftest import register


@pytest.fixture(autouse=True)
def no_manual_gap(monkeypatch):
    monkeypatch.setattr(agent_router, "MANUAL_GAP", timedelta(0))


def run(client):
    r = client.post("/api/agent/runs")
    assert r.status_code == 201, r.text
    return r.json()["run"]


def pending(client):
    return [a for a in client.get("/api/approvals?limit=200").json()["approvals"] if a["status"] == "pending"]


def set_mandate(client, **values):
    r = client.patch("/api/mandate", json=values)
    assert r.status_code == 200, r.text


def test_level_2_queues_restocks_and_prices_once(seller):
    first = run(seller)
    assert first["status"] == "completed" and first["trigger"] == "manual"
    outcomes = {(a["kind"], a["outcome"]) for a in first["actions"]}
    assert ("restock", "queued") in outcomes and ("price", "queued") in outcomes
    queued = pending(seller)
    assert {a["actionType"] for a in queued} >= {"restock", "price_change"}
    assert all(a["agentName"] == "EcomMind" for a in queued)

    second = run(seller)
    assert {a["outcome"] for a in second["actions"]} == {"waiting"}
    assert "still waiting" in second["summary"]
    assert len(pending(seller)) == len(queued)  # nothing proposed twice


def test_level_1_only_recommends(seller):
    set_mandate(seller, autonomyLevel=1)
    r = run(seller)
    assert r["actions"] and {a["outcome"] for a in r["actions"]} == {"recommended"}
    assert pending(seller) == []
    events = seller.get("/api/activity/events?pageSize=50").json()["items"]
    assert any(e["action"].startswith("Recommends restocking") for e in events)


def test_level_3_sends_rfqs_and_applies_prices_within_limits(seller):
    set_mandate(seller, autonomyLevel=3, pricingMode="autonomous")
    before = {p["sku"]: p["price"] for p in seller.get("/api/products").json()["products"]}
    r = run(seller)
    restocks = [a for a in r["actions"] if a["kind"] == "restock"]
    assert restocks and all(a["outcome"] in ("rfq_sent", "purchased", "queued") for a in restocks)
    negs = seller.get("/api/negotiations").json()["negotiations"]
    assert {a["sku"] for a in restocks} <= {n["sku"] for n in negs}

    applied = [a for a in r["actions"] if a["kind"] == "price" and a["outcome"] == "applied"]
    assert applied
    after = {p["sku"]: p["price"] for p in seller.get("/api/products").json()["products"]}
    assert all(after[a["sku"]] != before[a["sku"]] for a in applied)

    # The open negotiations stop a second run from ordering the same products again.
    again = run(seller)
    assert all(a["outcome"] == "skipped" for a in again["actions"] if a["kind"] == "restock" and a["sku"] in {x["sku"] for x in restocks})


def test_paused_agent_skips(seller):
    assert seller.put("/api/agent/status", json={"status": "paused"}).status_code == 200
    r = run(seller)
    assert r["status"] == "skipped" and r["actions"] == []
    assert pending(seller) == []


def test_rejected_restock_is_not_proposed_again(seller):
    run(seller)
    restock = next(a for a in pending(seller) if a["actionType"] == "restock")
    assert seller.post(f"/api/approvals/{restock['id']}/reject", json={"reason": "Not now"}).status_code == 200
    again = run(seller)
    sku = restock["payload"]["sku"]
    hit = next(a for a in again["actions"] if a["kind"] == "restock" and a["sku"] == sku)
    assert hit["outcome"] == "skipped" and "declined" in hit["detail"]
    assert not any(a["actionType"] == "restock" and a["payload"]["sku"] == sku for a in pending(seller))


def test_approving_a_restock_sends_the_rfq(seller):
    run(seller)
    restock = next(a for a in pending(seller) if a["actionType"] == "restock")
    r = seller.post(f"/api/approvals/{restock['id']}/approve")
    assert r.status_code == 200, r.text
    negs = seller.get("/api/negotiations").json()["negotiations"]
    assert any(n["sku"] == restock["payload"]["sku"] for n in negs)


def test_manual_runs_are_rate_limited(seller, monkeypatch):
    monkeypatch.setattr(agent_router, "MANUAL_GAP", timedelta(minutes=5))
    run(seller)
    r = seller.post("/api/agent/runs")
    assert r.status_code == 429


def test_runs_list_and_schedule(seller):
    run(seller)
    body = seller.get("/api/agent/runs").json()
    assert len(body["runs"]) == 1
    assert body["schedule"]["cron"] == "30 3 * * *"


def test_cron_requires_secret(client, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "")
    assert client.get("/api/cron/agent-runs").status_code == 503
    monkeypatch.setattr(settings, "cron_secret", "s3cret-value")
    assert client.get("/api/cron/agent-runs").status_code == 401
    assert client.get("/api/cron/agent-runs", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_cron_runs_each_business_once_a_day(seller, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "s3cret-value")
    auth = {"Authorization": "Bearer s3cret-value"}
    r = seller.get("/api/cron/agent-runs", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["completed"] == 1
    runs = seller.get("/api/agent/runs").json()["runs"]
    assert runs[0]["trigger"] == "schedule" and runs[0]["status"] == "completed"
    assert pending(seller)

    # A repeated call the same day doesn't run the business again.
    assert seller.get("/api/cron/agent-runs", headers=auth).json()["completed"] == 0


def test_cron_leaves_out_demo_accounts(client, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "s3cret-value")
    assert client.post("/api/auth/demo").status_code == 200
    r = client.get("/api/cron/agent-runs", headers={"Authorization": "Bearer s3cret-value"})
    assert r.json()["completed"] == 0


def test_runs_are_private_to_each_business(client):
    register(client, email="first.seller@gmail.com")
    client.post("/api/demo/load")
    run(client)
    client.post("/api/auth/logout")
    register(client, email="second.seller@gmail.com", business="Other Store")
    assert client.get("/api/agent/runs").json()["runs"] == []
