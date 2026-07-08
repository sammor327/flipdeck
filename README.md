# FlipDeck — TCG Price Arbitrage Platform

> **Buy low. Sell high. Every card, every market.**

A price-tracking and arbitrage web app for trading card games — **Magic: The
Gathering, Riftbound, Yu-Gi-Oh!, Pokémon, and Disney Lorcana** — built for
flippers: sortable inventories, alert rules, push notifications, and **one-click
buy/sell approvals** driven by moving prices.

This repo contains both the **concept package** (pitch, features, tech notes,
HTML mockups) and a **working Next.js implementation** of it.

---

## Quickstart

> **Prerequisite:** Node.js ≥ 18.18. This project was authored in an environment
> without Node, Postgres, or Redis installed, so it ships with **SQLite** (via
> Prisma) and **in-memory** queue/rate-limiting so it runs with zero external
> services. See [Substitutions](#substitutions-vs-the-spec) below.

```bash
npm install          # installs deps and runs `prisma generate` (postinstall)
npm run setup        # prisma db push + seed the demo (60-card inventory, rules, approvals)
npm run dev          # http://localhost:3000  → logged in as the demo user "Sam"
```

That's it — the dashboard, inventory, card pages, and two pending approvals are
live immediately with realistic mock price history. No API keys required.

Optional, in a second terminal:

```bash
npm run worker       # background price-ingest loop (or click "↻ Refresh prices" in the app)
npm test             # unit tests: delta/spread math, fees, alert eval, expiry
```

### SQLite and the two-process setup

Running `npm run worker` next to `npm run dev` means **two OS processes write
the same SQLite file**. To keep the worker's per-minute write burst from
failing web actions with `SQLITE_BUSY` ("database is locked"), the shared
Prisma client (`src/lib/db.ts`) automatically runs `PRAGMA journal_mode=WAL`
(persists in the db file, so readers and the writer no longer block each
other) and `PRAGMA busy_timeout=5000` (a blocked writer waits up to 5 s for
the lock instead of erroring) on startup. `busy_timeout` is per-connection, so
`?connection_limit=1` on `DATABASE_URL` is recommended (see
[`.env.example`](.env.example)) — it pins Prisma to the single connection the
pragma was applied to.

---

## What's implemented

Delivered in the five increments from the build prompt:

1. **Schema + seed + mock provider** — Prisma models, a seeded demo (5 games,
   ~200 cards, 90 days of price history, cached stats), and a `PriceProvider`
   mock that random-walks prices so everything works without API keys.
2. **Inventory + dashboard (read-only core)** — mark-to-market portfolio value,
   unrealized P/L, top movers with sparklines, a fully sortable/filterable
   inventory table with fuzzy search, bulk actions, and CSV import/export.
3. **Alert engine + notifications** — a rule evaluator (threshold, % move,
   spread, new-low, cooldown) run by a worker tick, behind a `NotificationService`
   interface (Web Push adapter + console fallback), respecting quiet hours.
4. **Approvals flow** — fired rules create `TradeProposal`s; Approve/Decline are
   single-tap with a 5-second undo; proposals expire (default 30 min) and show
   "you missed / you dodged" hindsight; execution opens a compliant deep link.
5. **Real provider adapters behind env flags** — Scryfall (MTG), YGOPRODeck
   (Yu-Gi-Oh!), pokemontcg.io (Pokémon), Lorcast (Lorcana); Riftbound stays on
   the mock. Each falls back to the mock on any miss.

### Pages
Dashboard · Inventory · Card detail · Alerts & Approvals · Settings · Watchlist ·
Spread Scanner · Sign-in. Every page has empty / loading / error states and is
mobile-responsive; the approvals screen is phone-first.

### Accessibility
Deltas are **never color-only** — always a signed number + arrow with a
screen-reader label (see [`src/components/Delta.tsx`](src/components/Delta.tsx)).
Tables are keyboard-sortable with visible focus; charts are single-axis.

---

## Substitutions vs. the spec

The build prompt says: *"If any of these are unavailable in the environment,
substitute the closest equivalent and say so."* Node/Postgres/Redis were not
available, so:

| Spec | Shipped | How to switch to the spec'd tech |
|---|---|---|
| PostgreSQL | **SQLite** via Prisma | Set `datasource.provider = "postgresql"` in `prisma/schema.prisma`, point `DATABASE_URL` at Postgres, `npm run db:push`. Schema avoids SQLite-only compromises elsewhere. |
| Redis (queue + rate limit) | **In-memory** adapter behind an interface (`src/lib/queue`) | Implement the same interfaces against Redis and swap the exports in `src/lib/queue/index.ts` (gated on `REDIS_URL`). |
| Web Push | **Console/log** adapter default; Web Push when `VAPID_*` set | Generate keys: `npx web-push generate-vapid-keys`, set `VAPID_*` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. |
| Auth (magic-link + Google) | **Cookie sessions + dev magic-link** (URL logged to console); Google OAuth when `GOOGLE_*` set; **demo auto-login** in dev | Set `SMTP_URL` for real email; set `GOOGLE_CLIENT_ID/SECRET`; set `DISABLE_DEMO_AUTOLOGIN=1` to require real sign-in. |
| Cron worker | **`npm run worker`** loop + `POST /api/worker/tick` | Point any scheduler at the endpoint (guard with `WORKER_TRIGGER_KEY`). |

Every substitution is a **pluggable adapter behind an interface** — exactly the
extension seams the brief asks for (notifications, execution, providers, queue).

---

## Architecture

```
Provider adapters ─┐  (mock, Scryfall, pokemontcg, YGOPRODeck, Lorcast)
                   ▼
            Worker tick  ── append-only PricePoints ─► Stat engine (deltas/spread/liquidity)
        (src/lib/worker)                                     │
                   │                                         ▼
                   │                                   Rule evaluator ─► TradeProposal + NotificationLog
                   ▼                                         │                     │
            (npm run worker /                                ▼                     ▼
             ↻ Refresh prices)                         Notification svc       Approvals UI
                                                     (WebPush | console)   (approve/decline/undo)
                                                                                   │
                                                                                   ▼
                                                                    Execution layer (per-marketplace)
                                                                    deep-link mode │ api mode
```

- **Pure, unit-tested core** (no I/O): `src/lib/math.ts`, `fees.ts`, `stats.ts`,
  `portfolio.ts`, `alerts/evaluate.ts`, `alerts/expiry.ts`. Tests live beside
  them (`*.test.ts`).
- **Append-only price history** — `PricePoint` is never overwritten; `MarketStat`
  is a derived cache recomputed each tick, so rule eval is `O(rules)`.
- **Execution is per-marketplace** with a documented mode. No v1 marketplace
  permits automated ordering within ToS, so every adapter uses **deep-link mode**
  ("execute" = open a prefilled listing/checkout, human in the loop). Flip a
  marketplace's `executionMode` to `"api"` only where legitimately supported.

### Key directories
```
prisma/            schema.prisma, seed.ts
src/lib/           pure logic, providers, notifications, queue, execution, worker, auth
src/app/           App Router pages, server actions (actions/), API routes (api/)
src/components/    Delta, charts, tables, ApprovalCard, forms, shell
mockups/           the original HTML design mockups
```

## Environment variables

Dev defaults live in a committed `.env` (no real secrets) so the demo runs after
clone. See [`.env.example`](.env.example) for the full list — providers, VAPID,
Google OAuth, SMTP, and the worker cadence.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Start the app |
| `npm run setup` | `prisma generate` + `db push` + seed |
| `npm run seed` | Re-seed the demo (idempotent) |
| `npm run worker` | Run the ingest loop (`--once` for a single tick) |
| `npm test` | Unit tests (Vitest) |
| `npm run db:studio` | Prisma Studio |

---

## The concept package

The original planning artifacts remain in the repo:

| File | Purpose |
|---|---|
| [`BUILD_PROMPT.md`](BUILD_PROMPT.md) | The full build spec this app implements |
| [`PITCH_DECK.md`](PITCH_DECK.md) | 14-slide pitch with speaker notes |
| [`FEATURES.md`](FEATURES.md) | MVP / v1.1 / v2 feature backlog |
| [`TECH_NOTES.md`](TECH_NOTES.md) | Data sources, pipeline, **risks & compliance**, monetization |
| [`mockups/`](mockups/) | Five dark-theme HTML page mockups (the visual source of truth) |

**Read the Risks & compliance section of [`TECH_NOTES.md`](TECH_NOTES.md) before
wiring any automated buying — marketplace terms of service matter.**

## Not financial advice

Forecasts and proposals are informational only. FlipDeck keeps a human in the
loop on every trade by default.
