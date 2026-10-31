import threading

from fastapi.testclient import TestClient

from app.services import agent_calls
from conftest import key

AGENTS = ["agent-forecast-01", "agent-price-02", "agent-return-03", "agent-logistics-04"]


def counts(c):
    return {a["id"]: a["callsServed"] for a in c.get("/api/service-agents").json()["agents"]}


def balance(c):
    return c.get("/api/wallet").json()["balance"]


def test_successful_call_increments_only_that_agent(seller):
    before, bal = counts(seller), balance(seller)
    r = seller.post("/api/service-agents/agent-forecast-01/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["agent"]["callsServed"] == before["agent-forecast-01"] + 1
    assert body["call"]["status"] == "success" and body["receipt"]["amount"] == 400
    assert body["result"]["kind"] == "demand_forecast"
    after = counts(seller)
    assert after["agent-forecast-01"] == before["agent-forecast-01"] + 1
    assert all(after[a] == before[a] for a in AGENTS if a != "agent-forecast-01")
    assert balance(seller) == bal - 400
    # second call -> +1 again; count survives a fresh read (as after a page refresh)
    seller.post("/api/service-agents/agent-forecast-01/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    assert counts(seller)["agent-forecast-01"] == before["agent-forecast-01"] + 2


def test_each_agent_works(seller):
    for a in AGENTS:
        r = seller.post(f"/api/service-agents/{a}/calls", json={"sku": "PHN-003"}, headers={"Idempotency-Key": key()})
        assert r.status_code == 200, (a, r.text)


def test_retry_with_same_key_is_not_double_counted_or_charged(seller):
    before, bal, k = counts(seller), balance(seller), key()
    r1 = seller.post("/api/service-agents/agent-price-02/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": k})
    r2 = seller.post("/api/service-agents/agent-price-02/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": k})
    assert r1.status_code == r2.status_code == 200
    assert r2.json()["replayed"] is True and r2.json()["call"]["id"] == r1.json()["call"]["id"]
    assert counts(seller)["agent-price-02"] == before["agent-price-02"] + 1
    assert balance(seller) == bal - 200


def test_key_required(seller):
    r = seller.post("/api/service-agents/agent-price-02/calls", json={"sku": "EAR-001"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "idempotency_key_required"


def test_failed_call_does_not_count_or_charge(seller, monkeypatch):
    def boom(*_a):
        raise RuntimeError("model crashed")
    monkeypatch.setitem(agent_calls.EXECUTORS, "demand_forecast", boom)
    before, bal = counts(seller), balance(seller)
    r = seller.post("/api/service-agents/agent-forecast-01/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    assert r.status_code == 502 and r.json()["error"]["code"] == "agent_failed"
    assert counts(seller) == before and balance(seller) == bal
    hist = seller.get("/api/activity/executions", params={"status": "failed"}).json()
    assert hist["total"] == 1 and hist["items"][0]["charged"] == 0


def test_timeout_does_not_count_or_charge(seller, monkeypatch):
    import time

    from app.config import settings
    monkeypatch.setattr(settings, "agent_timeout_seconds", 0.2)
    monkeypatch.setitem(agent_calls.EXECUTORS, "logistics_quote", lambda *_a: time.sleep(1) or {})
    before, bal = counts(seller), balance(seller)
    r = seller.post("/api/service-agents/agent-logistics-04/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    assert r.status_code == 504
    assert counts(seller) == before and balance(seller) == bal


def test_mandate_rejection_records_call_without_charge(seller):
    m = seller.get("/api/mandate").json()["mandate"]
    m["maxPerCallCost"] = 100  # ₹1
    assert seller.put("/api/mandate", json=m).status_code == 200
    before, bal = counts(seller), balance(seller)
    r = seller.post("/api/service-agents/agent-forecast-01/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    assert r.status_code == 403 and r.json()["error"]["code"] == "mandate_per_call_limit"
    assert counts(seller) == before and balance(seller) == bal
    assert seller.get("/api/activity/executions", params={"status": "rejected"}).json()["total"] == 1


def test_insufficient_balance(seller):
    from app import db as dbmod
    from app.models import WalletTxn
    current = balance(seller)
    with dbmod.SessionLocal() as s:
        biz_id = s.query(WalletTxn).first().business_id
        s.add(WalletTxn(id="TXN-DRAIN", business_id=biz_id, counterparty="test", kind="refund",
                        amount=-current, status="Completed", signature="x", memo="drain"))
        s.commit()
    r = seller.post("/api/service-agents/agent-return-03/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    assert r.status_code == 402


def test_concurrent_calls_lose_no_increments(seller):
    before, bal = counts(seller)["agent-return-03"], balance(seller)
    cookies = dict(seller.cookies)
    errors = []

    def worker():
        with TestClient(seller.app) as c:
            c.cookies.update(cookies)
            r = c.post("/api/service-agents/agent-return-03/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
            if r.status_code != 200:
                errors.append(r.text)

    threads = [threading.Thread(target=worker) for _ in range(12)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert counts(seller)["agent-return-03"] == before + 12
    assert balance(seller) == bal - 12 * 100


def test_counter_is_global_across_sellers(client):
    from conftest import register
    register(client)
    client.post("/api/demo/load")
    start = counts(client)["agent-price-02"]
    client.post("/api/service-agents/agent-price-02/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    client.post("/api/auth/logout")
    register(client, email="second.seller@gmail.com")
    client.post("/api/demo/load")
    client.post("/api/service-agents/agent-price-02/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    assert counts(client)["agent-price-02"] == start + 2
