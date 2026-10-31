from conftest import key


def rfq(c, k=None, **over):
    body = {"supplierId": "SUP-B", "sku": "EAR-001", "quantity": 300, "targetUnitPrice": 17500,
            "deliveryLocation": "Jaipur, Rajasthan", "deliveryDays": 5, **over}
    return c.post("/api/rfqs", json=body, headers={"Idempotency-Key": k or key()})


def test_rfq_creates_persisted_linked_negotiation(seller):
    r = rfq(seller)
    assert r.status_code == 201, r.text
    data = r.json()
    neg, rq = data["negotiation"], data["rfq"]
    assert rq["supplierId"] == "SUP-B" and rq["supplierName"].startswith("Supplier B")
    assert neg["rfqId"] == rq["id"] and neg["supplierId"] == "SUP-B" and neg["sku"] == "EAR-001" and neg["quantity"] == 300
    kinds = [(m["sender"], m["kind"], m["unitPrice"]) for m in neg["messages"]]
    # RFQ -> supplier offer at list price -> EcomMind counter at target -> supplier final offer at floor
    assert kinds == [("ecommind", "rfq", None), ("supplier", "offer", 19500), ("ecommind", "counter", 17500), ("supplier", "offer", 18000)]
    assert neg["status"] == "offer_received"
    # survives a refresh
    again = seller.get(f"/api/negotiations/{neg['id']}").json()
    assert again["messages"] == neg["messages"]
    assert any(n["id"] == neg["id"] for n in seller.get("/api/negotiations").json()["negotiations"])


def test_rfq_is_idempotent(seller):
    k = key()
    a, b = rfq(seller, k), rfq(seller, k)
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["negotiation"]["id"] == b.json()["negotiation"]["id"] and b.json()["replayed"]
    assert len(seller.get("/api/rfqs").json()["rfqs"]) == 1


def test_rfq_validation(seller):
    assert rfq(seller, supplierId="SUP-Z").status_code == 404
    assert rfq(seller, sku="NOPE-1").status_code == 422
    assert rfq(seller, quantity=0).status_code == 422
    assert seller.get("/api/rfqs").json()["rfqs"] == []


def test_supplier_without_sku_declines(seller):
    neg = rfq(seller, supplierId="SUP-C", sku="LED-005").json()["negotiation"]
    assert neg["status"] == "declined"


def test_non_auto_supplier_stays_pending(seller):
    from app import db as dbmod
    from app.models import Supplier
    with dbmod.SessionLocal() as s:
        s.get(Supplier, "SUP-A").auto_respond = False
        s.commit()
    neg = rfq(seller, supplierId="SUP-A").json()["negotiation"]
    assert neg["status"] == "awaiting_supplier_response"
    assert [m["sender"] for m in neg["messages"]] == ["ecommind", "system"]  # no invented supplier reply


def test_accept_obeys_mandate(seller):
    neg = rfq(seller, quantity=400).json()["negotiation"]  # 400 x ₹180 = ₹72,000 > ₹60,000 max order
    r = seller.post(f"/api/negotiations/{neg['id']}/accept")
    assert r.status_code == 202 and r.json()["approval"]["actionType"] == "purchase"  # above the limit: queued
    assert r.json()["status"] == "offer_received" and r.json()["escrow"] is None
    neg = rfq(seller).json()["negotiation"]  # 300 x ₹180 = ₹54,000
    bal = seller.get("/api/wallet").json()["balance"]
    r = seller.post(f"/api/negotiations/{neg['id']}/accept")
    assert r.status_code == 200 and r.json()["status"] == "agreed" and r.json()["agreedUnitPrice"] == 18000
    assert seller.get("/api/wallet").json()["balance"] == bal  # wallet can't cover it: escrow waits, no money moved


def test_seller_counter(seller):
    neg = rfq(seller, targetUnitPrice=None).json()["negotiation"]
    assert neg["latestSupplierPrice"] == 19500
    r = seller.post(f"/api/negotiations/{neg['id']}/counter", json={"unitPrice": 18500})
    assert r.json()["messages"][-1]["kind"] == "accept"


def test_other_sellers_cannot_see_negotiation(seller):
    neg = rfq(seller).json()["negotiation"]
    seller.post("/api/auth/logout")
    from conftest import register
    register(seller, email="other.seller@gmail.com")
    assert seller.get(f"/api/negotiations/{neg['id']}").status_code == 404


def test_timestamps_carry_utc_offset(seller):
    neg = rfq(seller).json()["negotiation"]
    assert neg["createdAt"].endswith("+00:00") and neg["messages"][0]["createdAt"].endswith("+00:00")


def test_unverified_network_supplier_replies(seller):
    neg = rfq(seller, supplierId="SUP-C", targetUnitPrice=None).json()["negotiation"]
    assert neg["status"] == "offer_received" and neg["latestSupplierPrice"] == 18900
    assert neg["messages"][-1]["sender"] == "supplier"


def test_expired_price_list_still_gets_a_reply(seller):
    from datetime import date, timedelta

    from app import db as dbmod
    from app.models import SupplierQuote
    with dbmod.SessionLocal() as s:
        s.get(SupplierQuote, "Q-103").valid_till = date.today() - timedelta(days=2)
        s.commit()
    neg = rfq(seller, supplierId="SUP-C", targetUnitPrice=None).json()["negotiation"]
    assert neg["status"] == "offer_received" and "expired" in neg["messages"][-1]["text"]


def test_waiting_negotiations_are_answered_once_supplier_responds(seller):
    from app import db as dbmod
    from app.models import Supplier
    from app.services.negotiation import answer_waiting_negotiations
    with dbmod.SessionLocal() as s:
        s.get(Supplier, "SUP-A").auto_respond = False
        s.commit()
    neg = rfq(seller, supplierId="SUP-A", targetUnitPrice=None).json()["negotiation"]
    assert neg["status"] == "awaiting_supplier_response"
    with dbmod.SessionLocal() as s:
        s.get(Supplier, "SUP-A").auto_respond = True
        assert answer_waiting_negotiations(s) == 1
        s.commit()
    assert seller.get(f"/api/negotiations/{neg['id']}").json()["status"] == "offer_received"
