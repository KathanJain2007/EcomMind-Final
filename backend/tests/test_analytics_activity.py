from conftest import key


def test_summary_changes_with_range_and_is_deterministic(seller):
    s7 = seller.get("/api/analytics/summary", params={"days": 7}).json()
    s30 = seller.get("/api/analytics/summary", params={"days": 30}).json()
    assert 0 < s7["revenue"] < s30["revenue"]
    assert s30["orders"] < s30["units"]  # orders and units are different measures now
    assert seller.get("/api/analytics/summary", params={"days": 30}).json() == s30  # no randomness
    assert s30["productCount"] == 5 and s30["needsAttention"] == 2  # EAR-001 critical, LED-005 critical
    assert s30["activeAgents"] == 5 and s30["agentsDiscovered"] == 7


def test_daily_series_matches_summary(seller):
    d = seller.get("/api/analytics/daily", params={"days": 30}).json()["series"]
    s = seller.get("/api/analytics/summary", params={"days": 30}).json()
    assert len(d) == 30 and sum(x["revenue"] for x in d) == s["revenue"]


def test_category_filter(seller):
    all_ = seller.get("/api/analytics/products", params={"days": 30}).json()
    el = seller.get("/api/analytics/products", params={"days": 30, "category": "Electronics"}).json()
    assert {p["sku"] for p in el["products"]} == {"EAR-001", "LED-005"}
    assert sum(p["revenue"] for p in el["products"]) < sum(p["revenue"] for p in all_["products"])


def test_new_product_appears_everywhere(seller):
    r = seller.post("/api/products", json={"sku": "spk-006", "name": "Bluetooth Speaker", "category": "Electronics",
                                            "price": 199900, "cost": 120000, "stock": 40, "avgDailySales": 2})
    assert r.status_code == 201 and r.json()["sku"] == "SPK-006"
    assert seller.get("/api/analytics/summary").json()["productCount"] == 6
    assert seller.post("/api/products", json={"sku": "SPK-006", "name": "x", "category": "Electronics",
                                              "price": 100, "cost": 50, "stock": 1, "avgDailySales": 1}).status_code == 409
    assert seller.post("/api/products", json={"sku": "BAD-1", "name": "x", "category": "Electronics",
                                              "price": 100, "cost": 150, "stock": 1, "avgDailySales": 1}).status_code == 422


def test_forecast_and_pricing_are_computed(seller):
    f = seller.get("/api/analytics/forecast/EAR-001").json()
    assert f["demand30"] > f["demand7"] > 0 and f["confidencePct"] is not None
    assert len([x for x in f["series"] if "predicted" in x]) == 7
    intel = seller.get("/api/products/EAR-001/intelligence").json()
    p = intel["pricing"]
    assert p["suggestedPrice"] >= p["marginFloor"]


def test_activity_overview_and_execution_history(seller):
    o = seller.get("/api/activity/overview").json()
    assert o["totalCalls"] == 50 and o["successfulCalls"] == 50 and o["totalSpend"] == 6300
    seller.post("/api/service-agents/agent-forecast-01/calls", json={"sku": "EAR-001"}, headers={"Idempotency-Key": key()})
    o2 = seller.get("/api/activity/overview").json()
    assert o2["totalCalls"] == 51 and o2["totalSpend"] == 6700
    page = seller.get("/api/activity/executions", params={"pageSize": 10, "page": 1}).json()
    assert page["total"] == 51 and len(page["items"]) == 10
    assert page["items"][0]["agentName"] == "Demand Forecast Agent"  # newest first
    filtered = seller.get("/api/activity/executions", params={"agent": "agent-return-03"}).json()
    assert filtered["total"] == 40
    asc = seller.get("/api/activity/executions", params={"sort": "cost", "order": "asc", "pageSize": 1}).json()
    assert asc["items"][0]["cost"] == 100


def test_transactions_and_csv_exports(seller):
    t = seller.get("/api/activity/transactions", params={"kind": "service_call"}).json()
    assert t["total"] == 50
    r = seller.get("/api/activity/transactions.csv", params={"kind": "topup"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert r.text.splitlines()[0].startswith("Transaction,Time")
    for k in ["sales", "inventory", "agent-usage", "negotiations"]:
        assert seller.get(f"/api/activity/reports/{k}.csv", params={"days": 7}).status_code == 200
    cat = seller.get("/api/activity/reports", params={"days": 7}).json()
    assert {r["id"] for r in cat["reports"]} == {"sales", "inventory", "agent-usage", "negotiations"}


def test_wallet_is_ledger_consistent(seller):
    w = seller.get("/api/wallet").json()
    assert w["balance"] == 500000 - 6300 - 50000  # opening top-up − 50 seeded calls − logistics advance


def test_recommendations_and_wallet_daily(seller):
    recs = seller.get("/api/analytics/recommendations").json()["recommendations"]
    assert {r["sku"] for r in recs if r["id"].startswith("restock")} == {"EAR-001", "LED-005"}
    series = seller.get("/api/analytics/wallet-daily", params={"days": 7}).json()["series"]
    assert len(series) == 7 and sum(x["amount"] for x in series) == 6300 + 50000


def test_browser_features_can_log_activity(seller):
    r = seller.post("/api/activity/events", json={"agent": "Marketplace Sync Engine", "action": "New order (AMAZON): 2 x Yoga Mat",
                                                  "status": "success", "amount": 179800, "product": "Yoga Mat"})
    assert r.status_code == 201
    items = seller.get("/api/activity/events", params={"q": "Marketplace Sync"}).json()["items"]
    assert items[0]["action"].startswith("New order") and items[0]["amount"] == 179800
    assert seller.post("/api/activity/events", json={"agent": "x", "action": "y", "status": "bogus"}).status_code == 422
