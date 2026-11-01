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
UrbanNest Living sample business. Wallet funds are simulated top-ups; the
ledger, escrow and mandate checks run for real on the backend.

## Tests

```bash
cd backend && python -m pytest -q
npm test
```

## Landing page

The signed-out experience lives in `src/pages/landing/`. `/welcome` is the page itself;
`/login` and `/register` keep their URLs and open the same page with the matching form in a
dialog.

* **Structure** — `Landing` holds the header, ambient background and dialog, and renders `Hero`
  straight away. `Sections` (How It Works, `LivePreview`, `Features`, `Autonomy`, Who It's For,
  `Faq`, `FinalCta`) is a lazy chunk, and `LivePreview` loads separately just before it scrolls in.
* **First screen** — `heroMotion.ts` runs one `requestAnimationFrame` loop that shares a smoothed
  pointer position with the blobs, grid glow, card tilt, badges and magnetic button. It sleeps when
  the pointer rests and stops when the hero is off screen or the tab is hidden.
* **Background** — `BackgroundDecor.tsx` holds the floating ₹ coins, profit pill, bars and graphs. They
  are decorative, carry no numbers and sit behind the content. The running logo's white background
  is removed live by an SVG colour filter in `HeroChartCard.tsx`, without changing the video file.
* **Scroll reveals** — `Reveal.tsx` keeps one shared `IntersectionObserver` (threshold 0.2). An
  element gets `.is-visible` once and is then dropped. Stagger comes from the `--lp-delay` CSS
  variable, and only `opacity` and `transform` animate.
* **Timeline** — `HowItWorks` registers its container with the same observer. `.is-visible` scales
  the connecting line (horizontal from 1024px, vertical below) and fades in each step.
* **Sample data** — `sampleData.ts` is a pure, seeded generator (mulberry32), so the same seed
  replays the same numbers; see `sampleData.test.ts`. It makes no API calls, and every figure in
  the preview comes from it.
* **Chart updates and pausing** — the Web Animations API slides the recharts track left by one
  interval every 2.5 seconds. When that ends, the next point is added and the slide restarts in
  the same frame, so React only renders once per tick. `useLiveActive` pauses the slide and the
  other widgets' timers when the panel is off screen or the tab is hidden.
* **Reduced motion** — with `prefers-reduced-motion: reduce`, content is visible without reveals,
  blobs, parallax and bouncing stop, and the preview shows static sample values.
* **Authentication** — `AuthDialog` (Radix Dialog) renders the existing `Login` and `Register`
  pages through the router outlet, so their forms, validation, API calls and redirects are the
  ones in use. CTAs call `useAuthCta()`, which navigates to the right route. "Try the Live Demo"
  passes `startDemo` in the route state, and `Login` then runs its own Demo Login handler.

Files changed: `src/App.tsx`, `src/pages/auth/Login.tsx`, `src/pages/auth/Register.tsx`,
`index.html`, this README, and everything new in `src/pages/landing/`.
