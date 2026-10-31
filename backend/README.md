# EcomMind API (FastAPI + SQLite)

## Run it

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                     # then edit SECRET_KEY etc.
uvicorn app.main:app --reload --port 8000
```

In another terminal, from the project root: `npm install` then `npm run dev`.
Vite (port 3000) forwards `/api/*` to this server, so open http://localhost:3000.

The database (`backend/ecommind.db`) and the shared network data (service
agents, suppliers, couriers) are created on first start. Sellers get the
UrbanNest Living sample data only when they press **Load Demo Business** or
use **Demo Login**.

## Tests

```bash
cd backend && python -m pytest -q        # API: auth, GSTIN, places, agent calls, RFQs, escrow, analytics, activity
cd .. && npm test                          # browser-side email + GSTIN validators (same cases)
```

## Configuration (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Signs receipts and hashes session tokens. Use a long random value. |
| `DATABASE_URL` | Defaults to `sqlite:///./ecommind.db`. |
| `COOKIE_SECURE` | `true` when served over HTTPS. |
| `GOOGLE_MAPS_API_KEY` | Google Places (New) key for Business Location autocomplete. Server-side only. Enable "Places API (New)" for the key. Empty = manual entry, saved as unverified. |
| `PLACES_REGION_CODES` | Country filter for suggestions (default `in`). |
| `LOCATION_VERIFICATION_REQUIRED` | `true` = onboarding needs a location picked from suggestions. |
| `EMAIL_VERIFICATION` | `off`, `optional` (default) or `required`. |
| `SMTP_*` | Mail server for verification codes. If unset, the app says no code was sent. |
| `AGENT_TIMEOUT_SECONDS` | Service-agent calls slower than this fail without charge. |
| `AMAZON_SP_API_*`, `FLIPKART_APP_*`, `MEESHO_SUPPLIER_API_KEY`, `SHOPIFY_*`, `META_*` | Reserved for marketplace API adapters (none built yet; see `app/integrations/marketplaces.py`). Setting them does not mark a channel as connected. |

## Design notes

* **Money** is stored as integer paise. Wallet balance is the sum of the ledger, never a stored number.
* **Email**: Gmail only (`app/validation/email.py`, mirrored in `src/lib/validation/email.ts`). Accounts are unique on the canonical Gmail address, so `a.b+shop@gmail.com` and `ab@gmail.com` can't register twice.
* **Passwords**: scrypt with a per-password salt. Sessions are random tokens in an httpOnly cookie; only their hash is stored. Passwords, tokens and request bodies are never logged.
* **GSTIN**: structure, state code, PAN, holder type, entity code, `Z` and the mod-36 check character are validated (`app/validation/gstin.py`). This is format validation only; nothing is checked with the GST portal, and the UI says so. GSTIN is unique per business, full value only on the owner-only `/api/business/profile`.
* **Agent calls** (`app/services/agent_calls.py`): one row per logical call keyed by `Idempotency-Key`. The counter increment (`calls_served = calls_served + 1`), wallet debit and success mark commit together under `BEGIN IMMEDIATE`. Failed, rejected and timed-out calls are recorded but never charged or counted.
* **RFQs** (`app/routers/rfq.py`, `app/services/negotiation.py`): RFQ and negotiation are persisted before the response. Supplier replies come only from suppliers whose agent auto-responds; others stay "awaiting supplier response". Accepting a deal is a seller action checked against the mandate; it opens an escrow and locks the funds if the wallet covers them.
* **Escrow** (`app/services/escrow.py`, `/api/escrows`): one escrow per agreed negotiation (unique `negotiation_id`). `pending → locked → dispatched → delivered → released`, with `refund` from locked/dispatched and `cancel` from pending. Locking re-checks wallet balance, per-order and daily mandate limits. Every transition is a compare-and-set `UPDATE … WHERE status = …` under `BEGIN IMMEDIATE`, and a partial unique index on `wallet_txns (ref, kind)` makes a second lock, release or refund entry impossible. Ledger: lock `-amount`, release `0` (`gross_amount` = amount paid out of escrow), refund `+amount`. Confirming delivery adds the units to stock and writes a `stock_movements` row.
* **Repricing** (`app/services/pricing.py`): `POST /api/products/{sku}/price` and the all-or-nothing `POST /api/products/prices` are the only ways a price changes. Each change is checked against the mandate (gross margin floor, ±max change band, max discount; festival markdowns use the discount cap as their band; agent changes also need `pricingMode = autonomous`). Failing changes return `409 needs_approval` with the safeguard results and apply only with the signed-in seller's explicit approval, recorded as an override. Every applied change writes a `price_changes` row (old/new price, reason, source, actor, margin, safeguards) via a compare-and-set on the old price. Pricing rules live in the mandate (`PATCH /api/mandate`).
* **Marketplace orders** (`app/services/orders.py`, `app/integrations/marketplaces.py`): listings (`/api/listings`) link a product to a channel and always sell at the product's price from its stock, so all channels share one stock pool. `POST /api/orders` (Idempotency-Key) takes stock with `UPDATE … SET stock = stock - q WHERE stock >= q`, so concurrent orders on different channels can't oversell. Every stock change (opening stock, sale, cancellation, return, supplier delivery, adjustment) writes a `stock_movements` row. Orders add to `sales_daily` (and `return_stats` when a pincode is given); cancellations reverse them. No marketplace API adapter exists yet, so channels report `not_connected` and orders are recorded in EcomMind.
* **Approval queue & autonomy** (`app/services/approvals.py`, `/api/approvals`): the mandate stores `autonomy_level` (1 advisory, 2 approval-based, 3 restricted autonomous). Purchases, escrow locks and price changes above the mandate, and agent price changes below level 3 or outside autonomous pricing, are queued instead of refused (unless "approval above limit" is off). Approving flips `pending → approved` with a compare-and-set and executes the action in the same transaction, so it runs exactly once; a failed execution rolls back and leaves the item pending with `last_error`. Who decided and when is stored. A partial unique index stops the same proposal being pending twice. Supported actions: `price_change`, `bulk_price_change`, `purchase` (accept a deal, open escrow, lock funds), `restock` (send an RFQ) and `escrow_lock`.
* **Migrations** (`app/migrations.py`): additive, numbered, never drop data.
