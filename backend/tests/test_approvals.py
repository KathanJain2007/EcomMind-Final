"""Approval queue: over-limit actions are queued, approval executes exactly once, decisions are recorded."""
import threading

from conftest import key, register


def rfq(c, quantity=400, sku="EAR-001"):
    body = {"supplierId": "SUP-B", "sku": sku, "quantity": quantity, "targetUnitPrice": 17500,
            "deliveryLocation": "Jaipur", "deliveryDays": 5}
    return c.post("/api/rfqs", json=body, headers={"Idempotency-Key": key()}).json()["negotiation"]


def top_up(c, rupees):
    c.post("/api/wallet/topups", json={"amount": rupees * 100}, headers={"Idempotency-Key": key()})


def price(c, sku="EAR-001"):
    return next(p for p in c.get("/api/products").json()["products"] if p["sku"] == sku)["price"]


def test_autonomy_level_persists_across_sessions(seller):
    assert seller.get("/api/mandate").json()["mandate"]["autonomyLevel"] == 2
    assert seller.patch("/api/mandate", json={"autonomyLevel": 3}).json()["mandate"]["autonomyLevel"] == 3
    assert seller.patch("/api/mandate", json={"autonomyLevel": 4}).status_code == 422
    seller.post("/api/auth/logout")
    seller.post("/api/auth/login", json={"email": "seller.one@gmail.com", "password": "secret123"})
    assert seller.get("/api/mandate").json()["mandate"]["autonomyLevel"] == 3


def test_purchase_above_mandate_is_queued_then_executed_on_approval(seller):
    neg = rfq(seller)  # 400 x ₹180 = ₹72,000 > ₹60,000 per-order limit
    r = seller.post(f"/api/negotiations/{neg['id']}/accept")
    assert r.status_code == 202
    a = r.json()["approval"]
    assert a["actionType"] == "purchase" and a["financialImpact"] == -72_000_00 and a["reasons"] == ["mandate_max_order_value"]
    assert seller.get("/api/approvals?status=pending").json()["pendingCount"] == 1
    assert seller.get(f"/api/negotiations/{neg['id']}").json()["status"] == "offer_received"
    top_up(seller, 80_000)
    bal = seller.get("/api/wallet").json()["balance"]
    r = seller.post(f"/api/approvals/{a['id']}/approve")
    assert r.status_code == 200, r.text
    done = r.json()
    assert done["status"] == "approved" and done["decidedBy"] == "Asha Rao" and done["decidedAt"] and done["executedAt"]
    assert done["result"]["escrowStatus"] == "locked"
    n = seller.get(f"/api/negotiations/{neg['id']}").json()
    assert n["status"] == "agreed" and n["escrow"]["status"] == "locked"
    assert seller.get("/api/wallet").json()["balance"] == bal - 72_000_00
    # approving again does nothing more
    assert seller.post(f"/api/approvals/{a['id']}/approve").json()["status"] == "approved"
    assert len(seller.get("/api/escrows").json()["escrows"]) == 1
    assert seller.get("/api/wallet").json()["balance"] == bal - 72_000_00


def test_concurrent_approvals_execute_once(seller):
    seller.post("/api/products/EAR-001/price", json={"newPrice": 89900, "reason": "Flash sale"})
    a = seller.get("/api/approvals?status=pending").json()["approvals"][0]
    from app import db as dbmod
    from app.models import Approval, PriceChange, User
    from app.services import approvals as svc
    from sqlalchemy import func, select
    barrier, errors = threading.Barrier(6), []

    def go():
        barrier.wait()
        try:
            with dbmod.SessionLocal() as s:
                user = s.scalar(select(User).where(User.email == "seller.one@gmail.com"))
                svc.approve(s, s.get(Approval, a["id"]), user)
                s.commit()
        except Exception as e:  # noqa: BLE001
            errors.append(e)
    ts = [threading.Thread(target=go) for _ in range(6)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    with dbmod.SessionLocal() as s:
        assert s.scalar(select(func.count()).select_from(PriceChange)) == 1
    assert price(seller) == 89900 and not errors


def test_reject_records_who_and_when_and_nothing_runs(seller):
    a = seller.post("/api/products/EAR-001/price", json={"newPrice": 89900, "reason": "Flash sale"}).json()["approval"]
    r = seller.post(f"/api/approvals/{a['id']}/reject", json={"reason": "Too deep a discount"})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "rejected" and j["rejectionReason"] == "Too deep a discount" and j["decidedBy"] == "Asha Rao"
    assert price(seller) == 149900
    assert seller.post(f"/api/approvals/{a['id']}/approve").status_code == 409


def test_stale_approval_fails_safely_and_stays_pending(seller):
    a = seller.post("/api/products/EAR-001/price", json={"newPrice": 89900, "reason": "Flash sale"}).json()["approval"]
    seller.post("/api/products/EAR-001/price", json={"newPrice": 145000, "reason": "Competitor"})  # price moved meanwhile
    r = seller.post(f"/api/approvals/{a['id']}/approve")
    assert r.status_code == 409 and r.json()["error"]["code"] == "price_changed"
    j = seller.get(f"/api/approvals/{a['id']}").json()
    assert j["status"] == "pending" and "now ₹1,450" in j["lastError"]
    assert price(seller) == 145000


def test_escrow_lock_approval_overrides_limit_once(seller):
    seller.patch("/api/mandate", json={"maxOrderValue": 70_000_00})
    neg = rfq(seller, quantity=380)  # ₹68,400
    seller.post(f"/api/negotiations/{neg['id']}/accept")  # agreed; wallet too small -> pending escrow
    esc = seller.get(f"/api/negotiations/{neg['id']}").json()["escrow"]
    assert esc["status"] == "pending"
    seller.patch("/api/mandate", json={"maxOrderValue": 50_000_00})
    top_up(seller, 70_000)
    r = seller.post(f"/api/escrows/{esc['id']}/lock")
    assert r.status_code == 202 and r.json()["status"] == "pending"
    a = r.json()["approval"]
    assert a["actionType"] == "escrow_lock"
    assert seller.post(f"/api/escrows/{esc['id']}/lock").json()["approval"]["id"] == a["id"]  # not queued twice
    assert seller.post(f"/api/approvals/{a['id']}/approve").json()["result"]["escrowStatus"] == "locked"
    assert seller.get(f"/api/escrows/{esc['id']}").json()["status"] == "locked"


def test_restock_approval_creates_the_rfq(seller):
    from app import db as dbmod
    from app.models import Business
    from app.services import approvals as svc
    from sqlalchemy import select
    with dbmod.SessionLocal() as s:
        bid = s.scalar(select(Business.id))
        a = svc.queue(s, bid, action_type="restock", title="Restock 200 × Wireless Earbuds", description="Coverage 5 days",
                      agent_name="Demand Forecast Agent", reasons=["autonomy_level"], financial_impact=-36_000_00,
                      payload={"sku": "EAR-001", "quantity": 200, "supplierId": "SUP-B", "targetUnitPrice": 17500,
                               "deliveryLocation": "Jaipur", "deliveryDays": 5}, dedupe_key="restock:EAR-001")
        s.commit()
        aid = a.id
    r = seller.post(f"/api/approvals/{aid}/approve")
    assert r.status_code == 200 and r.json()["result"]["negotiationId"].startswith("NEG-")
    negs = seller.get("/api/negotiations").json()["negotiations"]
    assert len(negs) == 1 and negs[0]["quantity"] == 200


def test_isolation(seller):
    a = seller.post("/api/products/EAR-001/price", json={"newPrice": 89900, "reason": "Flash sale"}).json()["approval"]
    seller.post("/api/auth/logout")
    assert seller.get("/api/approvals").status_code == 401
    register(seller, email="other.seller@gmail.com")
    assert seller.post(f"/api/approvals/{a['id']}/approve").status_code == 404
    assert seller.get("/api/approvals").json()["approvals"] == []
