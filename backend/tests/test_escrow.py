"""Escrow: created on accept, funds locked in the ledger, full lifecycle, refunds,
no double release/refund, concurrency and seller isolation."""
import threading

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from conftest import key, register

ORDER = 300 * 18000  # 300 units at the supplier's ₹180 floor = ₹54,000


def rfq(c, **over):
    body = {"supplierId": "SUP-B", "sku": "EAR-001", "quantity": 300, "targetUnitPrice": 17500,
            "deliveryLocation": "Jaipur, Rajasthan", "deliveryDays": 5, **over}
    r = c.post("/api/rfqs", json=body, headers={"Idempotency-Key": key()})
    assert r.status_code == 201, r.text
    return r.json()["negotiation"]


def top_up(c, rupees):
    r = c.post("/api/wallet/topups", json={"amount": rupees * 100}, headers={"Idempotency-Key": key()})
    assert r.status_code == 201, r.text


def balance(c):
    return c.get("/api/wallet").json()["balance"]


def accepted(c, fund=True):
    if fund:
        top_up(c, 60_000)
    neg = rfq(c)
    r = c.post(f"/api/negotiations/{neg['id']}/accept")
    assert r.status_code == 200, r.text
    return r.json()


def ledger_rows(escrow_id, kind=None):
    from app import db as dbmod
    from app.models import WalletTxn
    with dbmod.SessionLocal() as s:
        stmt = select(func.count()).select_from(WalletTxn).where(WalletTxn.ref == escrow_id)
        if kind:
            stmt = stmt.where(WalletTxn.kind == kind)
        return s.scalar(stmt)


def test_accept_creates_escrow_and_locks_funds(seller):
    before_bal = balance(seller) + 60_000_00
    neg = accepted(seller)
    esc = neg["escrow"]
    assert esc and esc["status"] == "locked" and esc["amount"] == ORDER
    assert balance(seller) == before_bal - ORDER
    d = seller.get(f"/api/escrows/{esc['id']}").json()
    assert d["negotiationId"] == neg["id"] and d["supplierId"] == "SUP-B" and d["quantity"] == 300 and d["unitPrice"] == 18000
    assert d["buyerUserId"] and d["createdAt"] and d["lockedAt"]
    assert [(t["kind"], t["amount"]) for t in d["ledger"]] == [("escrow_lock", -ORDER)]
    assert "locked in escrow" in neg["messages"][-1]["text"]
    w = seller.get("/api/wallet").json()
    assert w["inEscrow"] == ORDER
    s = seller.get("/api/escrows/summary").json()
    assert s["held"] == ORDER and s["byStatus"]["locked"]["count"] == 1


def test_accept_twice_creates_one_escrow(seller):
    neg = accepted(seller)
    again = seller.post(f"/api/negotiations/{neg['id']}/accept")
    assert again.status_code == 200 and again.json()["escrow"]["id"] == neg["escrow"]["id"]
    assert len(seller.get("/api/escrows").json()["escrows"]) == 1
    assert ledger_rows(neg["escrow"]["id"], "escrow_lock") == 1


def test_insufficient_balance_leaves_escrow_pending_then_lock(seller):
    bal = balance(seller)  # demo wallet is ~₹4,000: short of ₹54,000
    neg = accepted(seller, fund=False)
    esc = neg["escrow"]
    assert esc["status"] == "pending" and "short of" in esc["statusNote"]
    assert balance(seller) == bal and ledger_rows(esc["id"]) == 0
    assert "no money has moved" in neg["messages"][-1]["text"]
    r = seller.post(f"/api/escrows/{esc['id']}/lock")
    assert r.status_code == 402 and r.json()["error"]["code"] == "insufficient_balance"
    top_up(seller, 60_000)
    r = seller.post(f"/api/escrows/{esc['id']}/lock")
    assert r.status_code == 200 and r.json()["status"] == "locked"
    assert seller.post(f"/api/escrows/{esc['id']}/lock").json()["status"] == "locked"  # idempotent
    assert ledger_rows(esc["id"], "escrow_lock") == 1


def test_lock_rechecks_mandate(seller):
    neg = accepted(seller, fund=False)
    top_up(seller, 60_000)
    m = seller.get("/api/mandate").json()["mandate"]
    r = seller.put("/api/mandate", json={**m, "maxOrderValue": 50_000_00})
    assert r.status_code == 200, r.text
    r = seller.post(f"/api/escrows/{neg['escrow']['id']}/lock")
    # above the mandate: goes to the approval queue, no money moves
    assert r.status_code == 202 and r.json()["approval"]["actionType"] == "escrow_lock" and r.json()["status"] == "pending"
    assert ledger_rows(neg["escrow"]["id"]) == 0
    seller.put("/api/mandate", json={**m, "maxOrderValue": 50_000_00, "approvalAboveLimit": False})
    r = seller.post(f"/api/escrows/{neg['escrow']['id']}/lock")
    assert r.status_code == 403 and r.json()["error"]["code"] == "mandate_max_order_value"
    seller.put("/api/mandate", json={**m, "agentsPaused": True})
    r = seller.post(f"/api/escrows/{neg['escrow']['id']}/lock")
    assert r.status_code == 403 and r.json()["error"]["code"] == "agents_paused"


def test_full_lifecycle_release(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    stock_before = next(p for p in seller.get("/api/products").json()["products"] if p["sku"] == "EAR-001")["stock"]
    bal = balance(seller)
    # out of order transitions are refused
    assert seller.post(f"/api/escrows/{esc_id}/release").status_code == 409
    assert seller.post(f"/api/escrows/{esc_id}/confirm-delivery").status_code == 409
    r = seller.post(f"/api/escrows/{esc_id}/dispatch", json={"courier": "BlueDart", "trackingId": "BD123"})
    assert r.status_code == 200 and r.json()["status"] == "dispatched" and r.json()["trackingId"] == "BD123"
    r = seller.post(f"/api/escrows/{esc_id}/confirm-delivery")
    assert r.status_code == 200 and r.json()["status"] == "delivered"
    stock_after = next(p for p in seller.get("/api/products").json()["products"] if p["sku"] == "EAR-001")["stock"]
    assert stock_after == stock_before + 300
    r = seller.post(f"/api/escrows/{esc_id}/release")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "released" and d["releasedAt"]
    assert [(t["kind"], t["amount"], t["grossAmount"]) for t in d["ledger"]] == [
        ("escrow_lock", -ORDER, ORDER), ("escrow_release", 0, ORDER)]
    assert d["ledger"][0]["status"] == "Released"
    assert balance(seller) == bal  # the money left the wallet at lock time, not again at release
    # double release / refund after release
    assert seller.post(f"/api/escrows/{esc_id}/release").status_code == 200
    assert ledger_rows(esc_id, "escrow_release") == 1
    assert seller.post(f"/api/escrows/{esc_id}/refund", json={"reason": "late"}).status_code == 409
    assert seller.get("/api/wallet").json()["inEscrow"] == 0
    # the stock receipt is recorded as a movement
    from app import db as dbmod
    from app.models import StockMovement
    with dbmod.SessionLocal() as s:
        mv = s.scalars(select(StockMovement).where(StockMovement.ref == esc_id)).all()
        assert [(m.kind, m.delta, m.resulting_stock) for m in mv] == [("restock_receipt", 300, stock_after)]


def test_refund_returns_funds_once(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    bal = balance(seller)
    assert seller.post(f"/api/escrows/{esc_id}/refund", json={"reason": ""}).status_code == 422
    r = seller.post(f"/api/escrows/{esc_id}/refund", json={"reason": "Supplier cancelled"})
    assert r.status_code == 200 and r.json()["status"] == "refunded" and r.json()["refundReason"] == "Supplier cancelled"
    assert balance(seller) == bal + ORDER
    assert seller.post(f"/api/escrows/{esc_id}/refund", json={"reason": "again"}).status_code == 200
    assert ledger_rows(esc_id, "refund") == 1 and balance(seller) == bal + ORDER
    assert seller.post(f"/api/escrows/{esc_id}/dispatch", json={}).status_code == 409
    assert seller.post(f"/api/escrows/{esc_id}/release").status_code == 409


def test_refund_during_transit_and_budget_restored(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    used = seller.get("/api/wallet").json()["budgetConsumedToday"]
    seller.post(f"/api/escrows/{esc_id}/dispatch", json={})
    assert seller.post(f"/api/escrows/{esc_id}/refund", json={"reason": "Lost in transit"}).json()["status"] == "refunded"
    assert seller.get("/api/wallet").json()["budgetConsumedToday"] == used - ORDER
    assert seller.post(f"/api/escrows/{esc_id}/confirm-delivery").status_code == 409  # no stock for refunded goods


def test_cancel_pending_only(seller):
    pending = accepted(seller, fund=False)["escrow"]["id"]
    assert seller.post(f"/api/escrows/{pending}/cancel").json()["status"] == "cancelled"
    assert seller.post(f"/api/escrows/{pending}/lock").status_code == 409


def test_list_filter_and_validation(seller):
    accepted(seller)
    assert len(seller.get("/api/escrows?status=locked").json()["escrows"]) == 1
    assert seller.get("/api/escrows?status=released").json()["escrows"] == []
    assert seller.get("/api/escrows?status=bogus").status_code == 422
    assert seller.get("/api/escrows/ESC-NOPE").status_code == 404


def test_escrow_ledger_shows_in_transactions(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    rows = seller.get("/api/activity/transactions?kind=escrow").json()["items"]
    assert any(t.get("ref") == esc_id or esc_id in (t.get("memo") or "") for t in rows)


def test_other_seller_cannot_touch_escrow(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    seller.post("/api/auth/logout")
    register(seller, email="other.seller@gmail.com")
    assert seller.get(f"/api/escrows/{esc_id}").status_code == 404
    assert seller.post(f"/api/escrows/{esc_id}/refund", json={"reason": "steal"}).status_code == 404
    assert seller.post(f"/api/escrows/{esc_id}/dispatch", json={}).status_code == 404
    assert seller.get("/api/escrows").status_code in (200, 409)
    if seller.get("/api/escrows").status_code == 200:
        assert seller.get("/api/escrows").json()["escrows"] == []
    assert ledger_rows(esc_id) == 1


def test_requires_login(client):
    assert client.get("/api/escrows").status_code == 401


def test_survives_new_session(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    seller.post("/api/auth/logout")
    r = seller.post("/api/auth/login", json={"email": "seller.one@gmail.com", "password": "secret123"})
    assert r.status_code == 200, r.text
    assert seller.get(f"/api/escrows/{esc_id}").json()["status"] == "locked"


def test_database_rejects_second_release_entry(seller):
    """Even if application code were bypassed, the ledger can't hold two releases."""
    esc_id = accepted(seller)["escrow"]["id"]
    from app import db as dbmod
    from app.models import WalletTxn
    with dbmod.SessionLocal() as s:
        biz = s.scalar(select(WalletTxn.business_id).where(WalletTxn.ref == esc_id))
        for i in range(2):
            s.add(WalletTxn(id=f"TXN-DUP{i}", business_id=biz, counterparty="x", kind="escrow_release", amount=0,
                            status="Released", signature="x", ref=esc_id))
        with pytest.raises(IntegrityError):
            s.commit()


def _race(fn, n=6):
    errors, barrier = [], threading.Barrier(n)

    def run():
        barrier.wait()
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            errors.append(e)
    threads = [threading.Thread(target=run) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return errors


def _service_call(esc_id, action, *args):
    from app import db as dbmod
    from app.models import Escrow
    from app.services import escrow as svc

    def call():
        with dbmod.SessionLocal() as s:
            e = s.get(Escrow, esc_id)
            getattr(svc, action)(s, e, *args)
            s.commit()
    return call


def test_concurrent_release_pays_once(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    seller.post(f"/api/escrows/{esc_id}/dispatch", json={})
    seller.post(f"/api/escrows/{esc_id}/confirm-delivery")
    _race(_service_call(esc_id, "release"))
    assert ledger_rows(esc_id, "escrow_release") == 1
    assert seller.get(f"/api/escrows/{esc_id}").json()["status"] == "released"


def test_concurrent_refund_refunds_once(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    bal = balance(seller)
    _race(_service_call(esc_id, "refund", "race"))
    assert ledger_rows(esc_id, "refund") == 1 and balance(seller) == bal + ORDER


def test_concurrent_lock_debits_once(seller):
    esc_id = accepted(seller, fund=False)["escrow"]["id"]
    top_up(seller, 60_000)
    bal = balance(seller)
    _race(_service_call(esc_id, "lock"))
    assert ledger_rows(esc_id, "escrow_lock") == 1 and balance(seller) == bal - ORDER


def test_concurrent_lock_of_two_escrows_cannot_overdraw(seller):
    """Two deals that each fit the wallet but not together: exactly one locks."""
    ids = []
    for _ in range(2):
        neg = rfq(seller, quantity=200)  # 200 x ₹180 = ₹36,000 each
        ids.append(seller.post(f"/api/negotiations/{neg['id']}/accept").json()["escrow"]["id"])
    assert all(seller.get(f"/api/escrows/{i}").json()["status"] == "pending" for i in ids)
    top_up(seller, 40_000)  # ~₹44,000: enough for one, not both
    from app import db as dbmod
    from app.models import Escrow
    from app.services import escrow as svc

    def lock_one(eid):
        def go():
            with dbmod.SessionLocal() as s:
                svc.lock(s, s.get(Escrow, eid), raise_on_block=False)
                s.commit()
        return go
    threads = [threading.Thread(target=lock_one(x)) for x in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    statuses = sorted(seller.get(f"/api/escrows/{i}").json()["status"] for i in ids)
    assert statuses == ["locked", "pending"]
    assert balance(seller) >= 0


def test_escrow_report(seller):
    esc_id = accepted(seller)["escrow"]["id"]
    rep = seller.get("/api/activity/reports").json()
    assert next(r for r in rep["reports"] if r["id"] == "escrow")["rows"] == 1
    assert rep["snapshot"]["inEscrow"] == ORDER
    csv = seller.get("/api/activity/reports/escrow.csv").text
    assert esc_id in csv and "locked" in csv
