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
cd backend && python -m pytest -q        # API: auth, GSTIN, places, agent calls, RFQs, analytics, activity
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

## Design notes

* **Money** is stored as integer paise. Wallet balance is the sum of the ledger, never a stored number.
* **Email**: Gmail only (`app/validation/email.py`, mirrored in `src/lib/validation/email.ts`). Accounts are unique on the canonical Gmail address, so `a.b+shop@gmail.com` and `ab@gmail.com` can't register twice.
* **Passwords**: scrypt with a per-password salt. Sessions are random tokens in an httpOnly cookie; only their hash is stored. Passwords, tokens and request bodies are never logged.
* **GSTIN**: structure, state code, PAN, holder type, entity code, `Z` and the mod-36 check character are validated (`app/validation/gstin.py`). This is format validation only; nothing is checked with the GST portal, and the UI says so. GSTIN is unique per business, full value only on the owner-only `/api/business/profile`.
* **Agent calls** (`app/services/agent_calls.py`): one row per logical call keyed by `Idempotency-Key`. The counter increment (`calls_served = calls_served + 1`), wallet debit and success mark commit together under `BEGIN IMMEDIATE`. Failed, rejected and timed-out calls are recorded but never charged or counted.
* **RFQs** (`app/routers/rfq.py`, `app/services/negotiation.py`): RFQ and negotiation are persisted before the response. Supplier replies come only from suppliers whose agent auto-responds; others stay "awaiting supplier response". Accepting a deal is a seller action checked against the mandate and records the agreement only. No money moves.
* **Migrations** (`app/migrations.py`): additive, numbered, never drop data.
