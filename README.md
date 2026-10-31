# EcomMind

An autonomous commerce agent for e-commerce sellers: it forecasts demand, buys
data from paid service agents, negotiates restocks with supplier agents and
works inside a spending mandate the seller sets.

* `src/` — React 19 + Vite + Tailwind/shadcn front end
* `backend/` — FastAPI + SQLite API ([backend/README.md](backend/README.md))

## Quick start

```bash
# 1. API
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# 2. Web app (new terminal, project root)
npm install
npm run dev            # http://localhost:3000 — /api is proxied to :8000
```

Sign up with a Gmail address, or use **Demo Login** to explore the
UrbanNest Living sample business. All payments and escrow are simulated.

## Tests

```bash
cd backend && python -m pytest -q
npm test
```
