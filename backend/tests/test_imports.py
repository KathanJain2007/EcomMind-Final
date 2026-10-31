"""Data import: CSV/XLSX parsing, validation, persistence, dedupe, summary, isolation."""
import io
from datetime import date, timedelta

from conftest import register


def up(c, name, text_or_bytes, dataset=None, source=None):
    data = text_or_bytes.encode() if isinstance(text_or_bytes, str) else text_or_bytes
    form = {}
    if dataset:
        form["dataset"] = dataset
    if source:
        form["source"] = source
    return c.post("/api/imports", files={"file": (name, data)}, data=form)


def products(c):
    return {p["sku"]: p for p in c.get("/api/products").json()["products"]}


PRODUCTS_CSV = """SKU,Name,Category,Price (INR),Cost,Stock,Avg Daily Sales
MUG-01,Ceramic Mug,Home,299,110,40,3
LMP-02,Desk Lamp,Electronics,"1,299",640,8,1.5
BAD-03,Broken,Home,abc,10,1,1
BAD-04,Negative cost,Home,100,-150,1,1
MUG-01,Duplicate Mug,Home,299,110,40,3
"""


def test_products_import_persists_with_summary(client):
    register(client)
    r = up(client, "Products.csv", PRODUCTS_CSV)
    assert r.status_code == 201, r.text
    b = r.json()["batches"][0]
    assert b["dataset"] == "products" and b["status"] == "completed"
    assert (b["rowsTotal"], b["created"], b["failed"]) == (5, 2, 3)
    msgs = {e["row"]: e["message"] for e in b["errors"]}
    assert '"price" must be a number' in msgs[4] and '"cost" can\'t be below 0' in msgs[5] and "more than once" in msgs[6]
    ps = products(client)
    assert ps["MUG-01"]["price"] == 29900 and ps["LMP-02"]["price"] == 129900 and ps["LMP-02"]["stock"] == 8
    mv = client.get("/api/stock-movements?sku=MUG-01").json()["movements"]
    assert mv[0]["kind"] == "import" and mv[0]["delta"] == 40
    # the history persists and is visible after reload
    hist = client.get("/api/imports").json()["batches"]
    assert hist[0]["id"] == b["id"] and hist[0]["failed"] == 3


def test_same_file_twice_changes_nothing(client):
    register(client)
    a = up(client, "Products.csv", PRODUCTS_CSV).json()["batches"][0]
    b = up(client, "products.csv", PRODUCTS_CSV).json()["batches"][0]
    assert b["duplicate"] is True and b["id"] == a["id"]
    assert len(client.get("/api/imports").json()["batches"]) == 1
    assert len(products(client)) == 2


def test_reimport_updates_price_with_history_and_stock_with_movement(seller):
    csv = "sku,name,category,price,cost,stock,avg_daily_sales\nEAR-001,Wireless Earbuds,Electronics,1399,780,150,20\n"
    b = up(seller, "products.csv", csv).json()["batches"][0]
    assert (b["created"], b["updated"]) == (0, 1)
    p = products(seller)["EAR-001"]
    assert p["price"] == 139900 and p["stock"] == 150
    h = seller.get("/api/price-history?sku=EAR-001").json()["changes"][0]
    assert (h["oldPrice"], h["newPrice"], h["source"]) == (149900, 139900, "import")
    mv = seller.get("/api/stock-movements?sku=EAR-001").json()["movements"][0]
    assert (mv["kind"], mv["delta"], mv["resultingStock"]) == ("import", 50, 150)
    # importing the same values again leaves the row unchanged
    b2 = up(seller, "products.csv", csv + "\n").json()["batches"][0]
    assert (b2["updated"], b2["unchanged"]) == (0, 1)


def test_sales_import_feeds_analytics_and_upserts(seller):
    d1 = (date.today() - timedelta(days=200)).isoformat()
    d2 = (date.today() - timedelta(days=201)).strftime("%d-%m-%Y")
    future = (date.today() + timedelta(days=3)).isoformat()
    csv = f"date,sku,units,revenue\n{d1},EAR-001,7,10493\n{d2},YOG-002,3,\n{future},EAR-001,1,\n{d1},NOPE-1,2,\n{d1},EAR-001,9,\n"
    b = up(seller, "Sales_History.csv", csv).json()["batches"][0]
    assert (b["created"], b["failed"]) == (2, 3)
    assert any("future" in e["message"] for e in b["errors"]) and any("unknown product" in e["message"] for e in b["errors"])
    from app import db as dbmod
    from app.models import SalesDaily
    from sqlalchemy import select
    with dbmod.SessionLocal() as s:
        row = s.scalar(select(SalesDaily).where(SalesDaily.sku == "YOG-002", SalesDaily.day == date.today() - timedelta(days=201)))
        assert (row.units, row.revenue) == (3, 3 * 89900)  # revenue defaults to units x catalogue price
    # correcting a day replaces it rather than adding a duplicate
    b = up(seller, "sales_fix.csv", f"date,sku,units\n{d1},EAR-001,8\n").json()["batches"][0]
    assert b["updated"] == 1
    with dbmod.SessionLocal() as s:
        rows = s.scalars(select(SalesDaily).where(SalesDaily.sku == "EAR-001", SalesDaily.day == date.today() - timedelta(days=200))).all()
        assert len(rows) == 1 and rows[0].units == 8


def test_sales_import_updates_avg_daily_sales(client):
    register(client)
    up(client, "products.csv", "sku,name,price,cost,stock\nCUP-1,Cup,100,40,50\n")
    lines = "\n".join(f"{(date.today() - timedelta(days=i)).isoformat()},CUP-1,4" for i in range(28))
    up(client, "sales.csv", "date,sku,units\n" + lines)
    p = products(client)["CUP-1"]
    assert p["avgDailySales"] == 4 and p["coverageDays"] == 12.5


def test_returns_and_supplier_quotes(seller):
    r = up(seller, "returns.csv", "pincode,sku,orders,returns,city\n302001,EAR-001,40,3,Jaipur\n12345,EAR-001,1,0,\n302002,EAR-001,2,5,\n")
    b = r.json()["batches"][0]
    assert (b["created"], b["failed"]) == (1, 2)
    risk = seller.get("/api/analytics/returns").json()
    assert any(p["pincode"] == "302001" for p in risk["pincodes"])
    csv = "supplier,sku,unit_price,delivery_days,moq\nKedar Electronics,EAR-001,176,3,100\nLocal Traders,EAR-001,170,6,50\n"
    b = up(seller, "Supplier_Quotes.csv", csv).json()["batches"][0]
    assert b["created"] == 2
    sups = seller.get("/api/suppliers").json()["suppliers"]
    own = next(s for s in sups if s["name"] == "Local Traders")
    assert own["imported"] and own["autoRespond"] is False  # no invented replies from an imported supplier
    quotes = seller.get("/api/supplier-quotes?sku=EAR-001").json()["quotes"]
    assert {q["unitPrice"] for q in quotes if q["imported"]} == {17600, 17000}
    # the network supplier's agent still negotiates from its own quote, not the imported one
    neg = seller.post("/api/rfqs", json={"supplierId": "SUP-B", "sku": "EAR-001", "quantity": 300, "deliveryLocation": "Jaipur",
                                         "deliveryDays": 5}, headers={"Idempotency-Key": "imp-test-rfq-1"}).json()["negotiation"]
    assert neg["latestSupplierPrice"] == 19500
    # an RFQ to the imported supplier waits for a real reply
    neg = seller.post("/api/rfqs", json={"supplierId": own["id"], "sku": "EAR-001", "quantity": 50, "deliveryLocation": "Jaipur",
                                         "deliveryDays": 7}, headers={"Idempotency-Key": "imp-test-rfq-2"}).json()["negotiation"]
    assert neg["status"] == "awaiting_supplier_response"


def test_xlsx_workbook_with_several_sheets(client):
    import openpyxl
    register(client)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sales"
    ws.append(["Date", "SKU", "Units"])
    ws.append([date.today() - timedelta(days=1), "PEN-1", 5])
    ws2 = wb.create_sheet("Products")
    ws2.append(["SKU", "Name", "Price", "Cost", "Stock"])
    ws2.append(["PEN-1", "Pen", 20, 5, 500])
    ws3 = wb.create_sheet("Notes")
    ws3.append(["anything"])
    buf = io.BytesIO()
    wb.save(buf)
    r = up(client, "business.xlsx", buf.getvalue())
    assert r.status_code == 201, r.text
    bs = r.json()["batches"]
    assert [b["dataset"] for b in bs] == ["products", "sales"]  # products first, Notes ignored
    assert all(b["failed"] == 0 for b in bs)
    assert products(client)["PEN-1"]["stock"] == 500


def test_mandate_and_logistics(client):
    register(client)
    b = up(client, "Seller_Mandate.csv", "daily_budget,max_order_value,max_per_call_cost\n90000,50000,12\n").json()["batches"][0]
    assert b["updated"] == 1
    m = client.get("/api/mandate").json()["mandate"]
    assert (m["dailyBudget"], m["maxOrderValue"], m["maxPerCallCost"]) == (9_000_000, 5_000_000, 1200)
    b = up(client, "Logistics_Quotes.csv", "courier,cost_per_500g,eta_days,cod\nShadowfax,38,2,yes\n").json()["batches"][0]
    assert b["created"] == 1
    assert any(q["courier"] == "Shadowfax" for q in client.get("/api/analytics/logistics").json()["quotes"])


def test_errors(client):
    register(client)
    assert up(client, "notes.txt", "hello").status_code == 415
    assert up(client, "mystery.csv", "a,b\n1,2\n").json()["error"]["code"] == "unknown_dataset"
    r = up(client, "x.csv", "sku,name\nA,B\n", dataset="products").json()["batches"][0]
    assert r["status"] == "failed" and "Missing required columns" in r["errors"][0]["message"]
    assert up(client, "products.csv", "").status_code == 422
    assert up(client, "bad.xlsx", b"not a zip").json()["error"]["code"] == "unreadable_file"
    big = b"sku,name,price,cost,stock\n" + b"x" * (10 * 1024 * 1024)
    assert up(client, "products.csv", big).status_code == 413
    assert up(client, "products.csv", "sku\nA\n", dataset="weird").status_code == 422


def test_onboarding_uses_same_service(client):
    register(client)
    r = up(client, "my inventory.csv", "sku,name,price,cost,stock\nTEA-1,Tea,150,60,20\n", dataset="products", source="onboarding")
    b = r.json()["batches"][0]
    assert b["source"] == "onboarding" and b["created"] == 1
    assert client.get("/api/imports").json()["batches"][0]["source"] == "onboarding"


def test_isolation(client):
    register(client)
    up(client, "Supplier_Quotes.csv", "supplier,sku,unit_price,delivery_days\nMy Secret Supplier,ZZ-1,10,2\n")  # fails: no ZZ-1
    up(client, "products.csv", "sku,name,price,cost,stock\nZZ-1,Thing,100,10,5\n")
    up(client, "Supplier_Quotes2.csv", "supplier,sku,unit_price,delivery_days\nMy Secret Supplier,ZZ-1,10,2\n")
    client.post("/api/auth/logout")
    assert client.post("/api/imports", files={"file": ("p.csv", b"x")}).status_code == 401
    register(client, email="other.seller@gmail.com")
    assert client.get("/api/imports").json()["batches"] == []
    assert all(s["name"] != "My Secret Supplier" for s in client.get("/api/suppliers").json()["suppliers"])
    assert all(not q["imported"] for q in client.get("/api/supplier-quotes").json()["quotes"])


def test_real_world_upload_edge_cases(client):
    register(client)

    # 1. Exported inventory format: "Product" column, currency symbols, and extra status/coverage columns
    exported_csv = (
        "SKU,Product,Category,Price,Cost,Stock,Avg daily sales,Coverage (days),Status\n"
        "EXP-001,Handcrafted Bowl,Home,Rs. 599/-,₹250,120,4.5,26.7,In Stock\n"
        "EXP-002,Bamboo Coasters,Kitchen,499,Rs. 180,50,,,\n"
    )
    r = up(client, "Exported_Inventory.csv", exported_csv)
    assert r.status_code == 201, r.text
    b = r.json()["batches"][0]
    assert b["dataset"] == "products" and b["status"] == "completed" and b["created"] == 2
    ps = products(client)
    assert ps["EXP-001"]["name"] == "Handcrafted Bowl" and ps["EXP-001"]["price"] == 59900 and ps["EXP-001"]["cost"] == 25000
    assert ps["EXP-002"]["name"] == "Bamboo Coasters" and ps["EXP-002"]["stock"] == 50

    # 2. Products with "Quantity" instead of "Stock"
    qty_csv = "sku,name,price,cost,quantity\nQTY-1,Test Item,200,100,75\n"
    r2 = up(client, "custom_products.csv", qty_csv)
    b2 = r2.json()["batches"][0]
    assert b2["dataset"] == "products" and b2["status"] == "completed" and b2["created"] == 1
    assert products(client)["QTY-1"]["stock"] == 75

    # 3. Filename has keyword 'products' but content is clearly sales (date, sku, units)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    sales_misnamed = f"date,sku,units\n{yesterday},EXP-001,15\n"
    r3 = up(client, "products_sold_october.csv", sales_misnamed)
    b3 = r3.json()["batches"][0]
    assert b3["dataset"] == "sales" and b3["status"] == "completed" and b3["created"] == 1

    # 4. Sales with US date and timestamp
    d_us = (date.today() - timedelta(days=2)).strftime("%m/%d/%Y")
    d_ts = f"{(date.today() - timedelta(days=3)).isoformat()} 14:30:00"
    sales_dates = f"date,sku,units\n{d_us},EXP-001,5\n{d_ts},EXP-002,8\n"
    r4 = up(client, "sales_more.csv", sales_dates)
    b4 = r4.json()["batches"][0]
    assert b4["status"] == "completed" and b4["created"] == 2

    # 5. Returns with spaced pincode (e.g. 302 001)
    ret_csv = "pincode,sku,orders,returns\n302 001,EXP-001,20,2\n"
    r5 = up(client, "returns.csv", ret_csv)
    b5 = r5.json()["batches"][0]
    assert b5["status"] == "completed" and b5["created"] == 1

    # 6. Single-sheet Excel workbook with generic sheet name "Sheet1" and explicit target
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["SKU", "Product", "Price", "Cost", "Stock"])
    ws.append(["XLS-01", "Excel Widget", 350, 150, 40])
    buf = io.BytesIO()
    wb.save(buf)
    r6 = up(client, "custom_export.xlsx", buf.getvalue(), dataset="products")
    assert r6.status_code == 201
    b6 = r6.json()["batches"][0]
    assert b6["dataset"] == "products" and b6["status"] == "completed" and b6["created"] == 1
    assert products(client)["XLS-01"]["name"] == "Excel Widget"

