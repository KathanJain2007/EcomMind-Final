"""Repricing: DB price changes, history, mandate safeguards, approvals, isolation, concurrency."""
import threading

from conftest import register


def product(c, sku="EAR-001"):
    return next(p for p in c.get("/api/products").json()["products"] if p["sku"] == sku)


def reprice(c, sku="EAR-001", price=145000, **over):
    return c.post(f"/api/products/{sku}/price", json={"newPrice": price, "reason": "Match competitor", **over})


def test_seller_change_within_mandate_updates_db_and_history(seller):
    r = reprice(seller)
    assert r.status_code == 200, r.text
    ch = r.json()["change"]
    assert ch["oldPrice"] == 149900 and ch["newPrice"] == 145000 and ch["pctChange"] == -3.3
    assert ch["source"] == "seller" and ch["actor"].startswith("Seller") and not ch["sellerOverride"]
    assert ch["safeguards"]["minMarginMet"] and ch["safeguards"]["maxChangeMet"]
    assert product(seller)["price"] == 145000
    hist = seller.get("/api/price-history").json()["changes"]
    assert [h["id"] for h in hist] == [ch["id"]] and hist[0]["reason"] == "Match competitor"
    assert seller.get("/api/price-history?sku=YOG-002").json()["changes"] == []
    # every reader sees the new DB price
    assert seller.get("/api/products/EAR-001/intelligence").json()["product"]["price"] == 145000
    ev = seller.get("/api/activity/events?q=Repriced").json()["items"]
    assert ev and "₹1,499 → ₹1,450" in ev[0]["action"]


def test_margin_floor_and_change_band_need_approval(seller):
    r = reprice(seller, price=89900)  # -40%, margin 13.2% < 15%
    assert r.status_code == 202
    a = r.json()["approval"]
    assert a["actionType"] == "price_change" and a["status"] == "pending"
    assert set(a["reasons"]) >= {"min_margin", "max_change", "max_discount"}
    assert product(seller)["price"] == 149900
    assert seller.get("/api/price-history").json()["changes"] == []
    # the same proposal isn't queued twice
    assert reprice(seller, price=89900).json()["approval"]["id"] == a["id"]
    # the seller's approval applies it and records it as an override
    r = seller.post(f"/api/approvals/{a['id']}/approve")
    assert r.status_code == 200 and r.json()["status"] == "approved" and r.json()["result"]["newPrice"] == 89900
    assert product(seller)["price"] == 89900
    h = seller.get("/api/price-history").json()["changes"][0]
    assert h["sellerOverride"] is True and h["source"] == "approval" and h["ref"] == a["id"]
    # the API has no way to skip the queue
    assert reprice(seller, price=59900, approved=True).status_code == 202
    assert reprice(seller, price=59900, source="approval").status_code == 422


def test_agent_change_respects_pricing_mode_and_autonomy(seller):
    r = reprice(seller, source="agent", actor="Market Price Agent")
    assert r.status_code == 202 and set(r.json()["approval"]["reasons"]) == {"pricing_mode", "autonomy_level"}
    assert seller.patch("/api/mandate", json={"pricingMode": "autonomous"}).json()["mandate"]["autoRepricing"] is True
    r = reprice(seller, price=144900, source="agent", actor="Market Price Agent")
    assert r.status_code == 202 and r.json()["approval"]["reasons"] == ["autonomy_level"]  # level 2: approval-based
    seller.patch("/api/mandate", json={"autonomyLevel": 3})
    r = reprice(seller, price=144800, source="agent", actor="Market Price Agent")
    assert r.status_code == 200 and r.json()["change"]["actor"] == "Market Price Agent"
    # still bounded by the band at level 3
    assert reprice(seller, price=199900, source="agent").status_code == 202
    seller.patch("/api/mandate", json={"agentsPaused": True})
    assert reprice(seller, price=144000, source="agent").json()["error"]["code"] == "agents_paused"


def test_mandate_limits_are_read_from_db(seller):
    seller.patch("/api/mandate", json={"maxPriceChangePct": 2})
    assert reprice(seller).status_code == 202  # -3.3% now outside ±2%
    m = seller.patch("/api/mandate", json={"maxPriceChangePct": 5, "minGrossMarginPct": 50}).json()["mandate"]
    assert m["maxPriceChangePct"] == 5 and m["minGrossMarginPct"] == 50
    assert reprice(seller, price=145100).json()["approval"]["reasons"] == ["min_margin"]
    # with approval requests turned off, an out-of-mandate change is refused
    seller.patch("/api/mandate", json={"approvalAboveLimit": False})
    assert reprice(seller, price=145200).json()["error"]["code"] == "outside_mandate"
    # PUT from Settings keeps pricing mode in step with autoRepricing
    full = seller.get("/api/mandate").json()["mandate"]
    seller.put("/api/mandate", json={**full, "autoRepricing": True, "pricingMode": None})
    assert seller.get("/api/mandate").json()["mandate"]["pricingMode"] == "autonomous"


def test_festival_markdown_uses_discount_cap(seller):
    body = {"changes": [{"sku": "EAR-001", "newPrice": 127400}, {"sku": "YOG-002", "newPrice": 76400}],
            "reason": "Diwali campaign 15% off", "source": "festival"}
    r = seller.post("/api/products/prices", json=body)
    assert r.status_code == 200, r.text
    assert {c["sku"] for c in r.json()["changes"]} == {"EAR-001", "YOG-002"}
    assert product(seller)["price"] == 127400 and product(seller, "YOG-002")["price"] == 76400


def test_bulk_is_all_or_nothing(seller):
    body = {"changes": [{"sku": "EAR-001", "newPrice": 145000}, {"sku": "PHN-003", "newPrice": 9900}],
            "reason": "Flash sale", "source": "festival"}
    r = seller.post("/api/products/prices", json=body)
    assert r.status_code == 202
    a = r.json()["approval"]
    assert a["actionType"] == "bulk_price_change" and len(a["payload"]["changes"]) == 2
    assert product(seller)["price"] == 149900  # the valid one wasn't applied either
    assert seller.post(f"/api/approvals/{a['id']}/approve").status_code == 200
    assert product(seller)["price"] == 145000 and product(seller, "PHN-003")["price"] == 9900
    bad = {**body, "changes": [{"sku": "EAR-001", "newPrice": 1}, {"sku": "EAR-001", "newPrice": 2}]}
    assert seller.post("/api/products/prices", json=bad).status_code == 422
    missing = {**body, "changes": [{"sku": "NOPE-9", "newPrice": 100}]}
    assert seller.post("/api/products/prices", json=missing).status_code == 404


def test_validation(seller):
    assert reprice(seller, price=0).status_code == 422
    assert reprice(seller, price=149900).json()["error"]["code"] == "no_change"
    assert reprice(seller, sku="NOPE-1").status_code == 404
    assert seller.post("/api/products/EAR-001/price", json={"newPrice": 145000, "reason": ""}).status_code == 422
    assert reprice(seller, source="hacker").status_code == 422
    r = reprice(seller, expectedPrice=150000)
    assert r.status_code == 409 and r.json()["error"]["code"] == "price_changed"


def test_isolation_and_auth(seller):
    reprice(seller)
    seller.post("/api/auth/logout")
    assert seller.post("/api/products/EAR-001/price", json={"newPrice": 1, "reason": "xxx"}).status_code == 401
    register(seller, email="other.seller@gmail.com")
    seller.post("/api/demo/load")
    assert seller.get("/api/price-history").json()["changes"] == []
    assert product(seller)["price"] == 149900  # the other seller's own copy is untouched


def test_concurrent_changes_record_consistent_history(seller):
    from app import db as dbmod
    from app.models import Business, PriceChange, Product
    from app.services import pricing as svc
    from sqlalchemy import select
    with dbmod.SessionLocal() as s:
        bid = s.scalar(select(Product.business_id).where(Product.sku == "EAR-001"))
        assert s.get(Business, bid)
    errors, barrier = [], threading.Barrier(5)

    def go(price):
        barrier.wait()
        try:
            with dbmod.SessionLocal() as s:
                svc.change_price(s, bid, "EAR-001", price, reason="race", source="seller", actor="Seller", user_id=None)
                s.commit()
        except Exception as e:  # noqa: BLE001
            errors.append(e)
    ts = [threading.Thread(target=go, args=(144000 + i * 100,)) for i in range(5)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    with dbmod.SessionLocal() as s:
        hist = s.scalars(select(PriceChange).where(PriceChange.business_id == bid).order_by(PriceChange.created_at)).all()
        final = s.scalar(select(Product.price).where(Product.business_id == bid, Product.sku == "EAR-001"))
    # history is a chain: each change starts from the previous one's new price
    assert hist[0].old_price == 149900
    for a, b in zip(hist, hist[1:]):
        assert b.old_price == a.new_price
    assert hist[-1].new_price == final
