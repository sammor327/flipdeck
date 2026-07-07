# Build Prompt — FlipDeck

Copy everything below the line into Claude Code (or Claude Design, for UI-only
iterations). Adjust the bracketed choices first if you have preferences.

---

## The prompt

Build a web application called **FlipDeck**: a price-tracking and arbitrage
platform for trading card games, aimed at users who buy low and sell high.

### Supported games (v1)

1. Magic: The Gathering
2. Riftbound (Riot's League of Legends TCG)
3. Yu-Gi-Oh!
4. Pokémon TCG
5. Disney Lorcana

Design the card catalog so adding a sixth game is a data migration, not a code
change (a `games` table, not an enum baked into logic).

### Tech stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS. Dark theme by
  default (see the supplied mockups for the visual language).
- **Backend:** Next.js API routes / server actions backed by PostgreSQL
  (Prisma ORM). Redis for the price-alert queue and rate limiting.
- **Jobs:** a scheduled worker (cron or queue-based) that pulls prices, computes
  deltas, evaluates alert rules, and fans out notifications.
- **Push notifications:** Web Push (service worker) for browsers; design the
  notification service behind an interface so native push (FCM/APNs) can be
  added later.
- **Auth:** email magic-link plus OAuth (Google). Sessions via secure cookies.

If any of these are unavailable in the environment, substitute the closest
equivalent and say so.

### Data model (minimum)

- `Game` — id, name, slug, icon.
- `Card` — game_id, name, set, collector number, rarity, finish/printing
  (foil, 1st edition, etc.), language, external ids (Scryfall / TCGplayer /
  Cardmarket / Pokémon TCG API ids where applicable), image URL.
- `PricePoint` — card_id, marketplace, condition, price, currency, listing
  count, captured_at. Store history; never overwrite.
- `MarketStat` (derived, cached) — card_id, 24h/7d/30d deltas, volatility,
  spread between marketplaces, liquidity score (listings + sales velocity).
- `User`, `Portfolio`, `InventoryItem` — card_id, quantity, condition, cost
  basis per unit, acquired_at, storage location/tag, status
  (owned / listed / sold), sold price + fees when sold.
- `WatchlistItem` — card_id, target buy price, target sell price, notes.
- `AlertRule` — user_id, scope (single card, watchlist, whole inventory),
  trigger (price crosses threshold, % move over window, spread between two
  marketplaces exceeds X, new low among tracked listings), action
  (notify only / notify + propose trade), cooldown.
- `TradeProposal` — the one-click approval object: user_id, card_id, side
  (buy/sell), quantity, proposed price, source marketplace + deep link,
  rationale (which rule fired, price snapshot), status
  (pending / approved / declined / expired / executed), expires_at.
- `NotificationLog` — what was sent, when, via which channel, and whether it
  was acted on.

### Price ingestion

Implement a provider interface (`PriceProvider`) with one adapter per source.
For development, ship a **mock provider** that generates realistic random-walk
price series for ~200 seeded cards across all five games so the whole app works
without API keys. Wire real adapters behind environment variables:

- Magic: Scryfall (free, includes TCGplayer/Cardmarket prices).
- Pokémon: Pokémon TCG API and/or TCGplayer.
- Yu-Gi-Oh!: YGOPRODeck API (free) and/or TCGplayer.
- Lorcana: TCGplayer category; community APIs (e.g. Lorcast) where available.
- Riftbound: TCGplayer category (verify availability; fall back to mock).

Poll cadence: hourly by default, 5-minute "fast lane" for cards with active
alert rules. Respect each source's rate limits and cache aggressively.

### Pages (match the supplied mockups)

1. **Dashboard** — portfolio value (hero number + line chart), unrealized P/L,
   active alerts count, pending approvals count, top movers table (with
   sparklines), pending approval cards inline.
2. **Inventory** — table with: card, game, set, condition, qty, cost basis,
   live market price, unrealized P/L ($ and %), 7d trend sparkline, actions
   (list for sale, edit, sell). Sortable by every column; filterable by game,
   condition, P/L direction, tag; bulk select for bulk actions; CSV
   import/export. Free-text search with fuzzy card-name matching.
3. **Card detail** — image, current prices per marketplace + condition, price
   history chart (1w/1m/3m/1y), spread panel ("buy on X at $a, sell on Y at
   $b, net after fees $c"), your holdings of that card, alert-rule builder.
4. **Alerts & approvals** — chronological notification feed; approval queue
   where each `TradeProposal` renders as a card with the rule that fired, the
   price evidence, fee-adjusted net, and **Approve / Decline** buttons.
   Approval opens the marketplace deep link (or executes via API where a
   marketplace legitimately supports it) and records the outcome.
5. **Settings** — notification channels and quiet hours, per-rule cooldowns,
   default marketplaces per game, fee profiles (marketplace fee %, shipping
   assumptions) used in net-proceeds math.

### One-click approvals — required behavior

- A fired rule with action "propose trade" creates a `TradeProposal` and sends
  a push notification whose body includes card, side, price, and net-after-fees.
- Notification click deep-links to the approval screen with that proposal
  focused; Approve and Decline are single-tap, with undo for 5 seconds.
- Proposals expire (default 30 minutes) since prices move; expired proposals
  show what the price did afterward ("you missed / you dodged" feedback).
- **Compliance guardrail:** where a marketplace's terms don't allow automated
  order placement, "execute" means: open a prefilled listing/checkout deep
  link. Keep the execution layer pluggable per marketplace and document, per
  adapter, which mode it uses.

### Quality bar

- Seed script creates a demo user with a 60-card inventory spanning all five
  games, live-looking price history, three alert rules, and two pending
  approvals — so the first `npm run dev` shows a working product.
- Unit tests for: delta/spread math, fee-adjusted net proceeds, alert-rule
  evaluation (threshold, % move, spread, cooldown), proposal expiry.
- Empty, loading, and error states for every page. Mobile-responsive
  throughout; the approvals screen must be excellent on a phone.
- Accessibility: keyboard-navigable tables, visible focus, deltas never
  communicated by color alone (always signed numbers with arrows).

Deliver incrementally: (1) schema + seed + mock provider, (2) inventory +
dashboard read-only, (3) alert engine + notifications, (4) approvals flow,
(5) real provider adapters behind env flags.

---

## Companion prompt for Claude Design (UI tweaking)

> Here are HTML mockups for FlipDeck, a dark-themed card-price arbitrage app
> (dashboard, inventory, card detail, alerts/approvals, mobile approval).
> Keep the overall structure and information hierarchy, but [describe your
> tweak — e.g. "make it feel more premium," "try a light theme variant,"
> "tighten the tables," "make the approval cards feel more urgent"]. Deltas
> must stay signed-number + arrow, never color alone; keep charts single-axis.
