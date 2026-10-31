"""Marketplace listings and orders: atomic stock, no overselling, movements, analytics feed, isolation."""
import threading
from datetime import datetime, timedelta, timezone

from conftest import key, register

IST = timezone(timedelta(hours=5, minutes=30))


def stock(c, sku="EAR-001"):
    return next(p for p in c.get("/api/products").json()["products"] if p["sku"] == sku)["stock"]


def order(c, channel="amazon", sku="EAR-001", quantity=2, k=None, **extra):
    return c.post("/api/orders", json={"channel": channel, "sku": sku, "quantity": quantity, **extra},
                  headers={"Idempotency-Key": k or key()})


def today_sales(c, sku="EAR-001"):
    from app import db as dbmod
    from app.models import SalesDaily
    from sqlalchemy import select
    with dbmod.SessionLocal() as s:
        row = s.scalar(select(SalesDaily).where(SalesDaily.day == datetime.now(IST).date(), SalesDaily.sku == sku))
        return (row.units, row.orders, row.revenue) if row else (0, 0, 0)


def test_channels_never_claim_api_connection(seller):
    ms = seller.get("/api/marketplaces").json()["marketplaces"]
    assert {m["id"] for m in ms} == {"amazon", "flipkart", "meesho", "shopify", "instagram"}
    assert all(m["connection"] == "not_connected" for m in ms)
    amazon = next(m for m in ms if m["id"] == "amazon")
    assert amazon["listings"] == 5 and amazon["revenue"] == 0 and amazon["credentialsRequired"]


def test_demo_listings_read_product_price_and_stock(seller):
    ls = seller.get("/api/listings?channel=amazon").json()["listings"]
    ear = next(l for l in ls if l["sku"] == "EAR-001")
    assert ear["price"] == 149900 and ear["stock"] == 100 and ear["status"] == "active"
    seller.post("/api/products/EAR-001/price", json={"newPrice": 145000, "reason": "Match competitor"})
    ear = next(l for l in seller.get("/api/listings?channel=flipkart").json()["listings"] if l["sku"] == "EAR-001")
    assert ear["price"] == 145000  # one price everywhere


def test_order_takes_stock_records_movement_and_feeds_sales(seller):
    before_stock, before_sales = stock(seller), today_sales(seller)
    r = order(seller, quantity=3, customerCity="Jaipur", customerPincode="302001")
    assert r.status_code == 201, r.text
    o = r.json()["order"]
    assert o["status"] == "confirmed" and o["quantity"] == 3 and o["grossAmount"] == 3 * 149900
    assert o["commission"] == round(3 * 149900 * 0.145) + 2500 and o["netProfit"] < o["grossAmount"]
    assert r.json()["stock"] == before_stock - 3 == stock(seller)
    u, n, rev = today_sales(seller)
    assert (u, n, rev) == (before_sales[0] + 3, before_sales[1] + 1, before_sales[2] + 3 * 149900)
    mv = seller.get("/api/stock-movements?sku=EAR-001").json()["movements"]
    assert mv[0]["kind"] == "sale" and mv[0]["delta"] == -3 and mv[0]["resultingStock"] == before_stock - 3 and mv[0]["ref"] == o["id"]
    assert mv[-1]["kind"] == "opening"
    # stock history adds up
    assert sum(m["delta"] for m in mv) == stock(seller)
    listing = next(l for l in seller.get("/api/listings?channel=amazon").json()["listings"] if l["sku"] == "EAR-001")
    assert listing["unitsSold"] == 3 and listing["revenue"] == 3 * 149900
    assert seller.get("/api/marketplaces").json()["marketplaces"][0]["pendingOrders"] == 1
    summary = seller.get("/api/orders/summary").json()
    assert summary["orders"] == 1 and summary["grossRevenue"] == 3 * 149900


def test_idempotent_order(seller):
    k = key()
    a, b = order(seller, k=k), order(seller, k=k)
    assert a.json()["order"]["id"] == b.json()["order"]["id"] and b.json()["replayed"]
    assert len(seller.get("/api/orders").json()["orders"]) == 1


def test_overselling_prevented(seller):
    s = stock(seller, "LED-005")  # 12 units
    r = order(seller, sku="LED-005", quantity=s + 1)
    assert r.status_code == 409 and r.json()["error"]["code"] == "insufficient_stock"
    assert r.json()["error"]["details"]["available"] == s and stock(seller, "LED-005") == s
    assert order(seller, sku="LED-005", quantity=s).status_code == 201
    assert stock(seller, "LED-005") == 0
    assert order(seller, channel="flipkart", sku="LED-005", quantity=1).status_code == 409
    ls = seller.get("/api/listings").json()["listings"]
    assert all(l["status"] == "out_of_stock" for l in ls if l["sku"] == "LED-005")


def test_concurrent_orders_across_channels_never_oversell(seller):
    from app import db as dbmod
    from app.models import Business, Product
    from app.services import orders as svc
    from sqlalchemy import select
    with dbmod.SessionLocal() as s:
        bid = s.scalar(select(Product.business_id).where(Product.sku == "LED-005"))
        assert s.get(Business, bid)
    ok, refused, barrier = [], [], threading.Barrier(8)
    channels = ["amazon", "flipkart", "meesho", "shopify"] * 2

    def buy(i):
        barrier.wait()
        try:
            with dbmod.SessionLocal() as s:
                svc.place_order(s, bid, channel=channels[i], sku="LED-005", quantity=2, idempotency_key=f"race-{i}-xxxxxx")
                s.commit()
                ok.append(i)
        except Exception as e:  # noqa: BLE001
            refused.append(getattr(e, "code", repr(e)))
    ts = [threading.Thread(target=buy, args=(i,)) for i in range(8)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert len(ok) == 6 and refused == ["insufficient_stock"] * 2  # 12 units / 2 per order
    assert stock(seller, "LED-005") == 0
    mv = seller.get("/api/stock-movements?sku=LED-005").json()["movements"]
    assert sum(m["delta"] for m in mv) == 0 and len([m for m in mv if m["kind"] == "sale"]) == 6


def test_order_lifecycle_cancel_and_return(seller):
    s0, sales0 = stock(seller), today_sales(seller)
    o = order(seller, quantity=2, customerPincode="110001", customerCity="New Delhi").json()["order"]
    assert seller.post(f"/api/orders/{o['id']}/deliver").status_code == 409  # must dispatch first
    assert seller.post(f"/api/orders/{o['id']}/cancel").json()["order"]["status"] == "cancelled"
    assert stock(seller) == s0 and today_sales(seller) == sales0  # stock and sales restored
    assert seller.post(f"/api/orders/{o['id']}/cancel").status_code == 200  # idempotent, no double restock
    assert stock(seller) == s0
    o2 = order(seller, quantity=1, customerPincode="110001").json()["order"]
    for a in ("dispatch", "deliver"):
        assert seller.post(f"/api/orders/{o2['id']}/{a}").status_code == 200
    r = seller.post(f"/api/orders/{o2['id']}/return")
    assert r.json()["order"]["status"] == "returned" and stock(seller) == s0
    assert seller.post(f"/api/orders/{o2['id']}/cancel").status_code == 409
    kinds = [m["kind"] for m in seller.get("/api/stock-movements?sku=EAR-001").json()["movements"][:4]]
    assert kinds == ["return", "sale", "cancellation", "sale"]


def test_listing_rules(seller):
    assert seller.post("/api/listings", json={"channel": "amazon", "sku": "EAR-001"}).status_code == 409
    seller.post("/api/products", json={"sku": "MUG-9", "name": "Mug", "category": "Home", "price": 29900, "cost": 10000,
                                       "stock": 5, "avgDailySales": 1})
    assert order(seller, sku="MUG-9").json()["error"]["code"] == "not_listed"
    assert seller.post("/api/listings", json={"channel": "meesho", "sku": "MUG-9", "mrp": 100}).status_code == 422
    r = seller.post("/api/listings", json={"channel": "meesho", "sku": "MUG-9", "mrp": 39900})
    assert r.status_code == 201 and r.json()["price"] == 29900
    lid = r.json()["id"]
    assert seller.patch(f"/api/listings/{lid}", json={"status": "paused"}).json()["status"] == "paused"
    assert order(seller, channel="meesho", sku="MUG-9").json()["error"]["code"] == "listing_paused"
    seller.patch(f"/api/listings/{lid}", json={"status": "active"})
    assert order(seller, channel="meesho", sku="MUG-9", quantity=5).status_code == 201
    mv = seller.get("/api/stock-movements?sku=MUG-9").json()["movements"]
    assert [m["kind"] for m in mv] == ["sale", "opening"]


def test_validation(seller):
    assert order(seller, channel="ebay").status_code == 422
    assert order(seller, quantity=0).status_code == 422
    assert order(seller, customerPincode="12").status_code == 422
    assert seller.post("/api/orders", json={"channel": "amazon", "sku": "EAR-001", "quantity": 1}).status_code == 400  # no key
    assert seller.post("/api/products/EAR-001/stock-adjustments", json={"delta": -100000, "reason": "count"}).status_code == 409
    r = seller.post("/api/products/EAR-001/stock-adjustments", json={"delta": 5, "reason": "Recount"})
    assert r.status_code == 201 and r.json()["stock"] == 105


def test_isolation(seller):
    o = order(seller).json()["order"]
    seller.post("/api/auth/logout")
    assert seller.get("/api/orders").status_code == 401
    register(seller, email="other.seller@gmail.com")
    assert seller.post(f"/api/orders/{o['id']}/cancel").status_code == 404
    assert seller.get("/api/listings").json()["listings"] == []
    assert order(seller).status_code == 404  # no EAR-001 in this seller's catalogue


def test_demo_reload_clears_orders(seller):
    order(seller)
    seller.post("/api/demo/load")
    assert seller.get("/api/orders").json()["orders"] == [] and stock(seller) == 100
