# FlipDeck — Feature List

Organized as **MVP → v1.1 → v2**, with an *Improve me* note on every feature —
a specific direction to push it further, so this doubles as a brainstorming
backlog. Cut ruthlessly from the bottom up.

## MVP (the product is not real without these)

### 1. Multi-game price tracking
Automatic price feeds for Magic, Riftbound, Yu-Gi-Oh!, Pokémon, and Lorcana;
per-card history (never overwritten), per-marketplace and per-condition
prices, refreshed hourly (5-min fast lane for cards with active rules).
- *Improve me:* per-printing granularity (foil/1st ed./alt-art), currency
  normalization (USD/EUR), and a data-freshness badge per card so users trust
  the number.

### 2. Inventory manager
Add cards manually, by search, or via CSV import. Track quantity, condition,
cost basis, acquisition date, physical location/tag, and status
(owned/listed/sold). Live mark-to-market value and per-card + portfolio P/L.
- *Improve me:* barcode/photo scan intake; deck-list paste import; realized
  vs. unrealized P/L split with tax-lot handling (FIFO/specific-lot).

### 3. Sorting & filtering
Every inventory and watchlist column sortable; filters for game, set,
condition, P/L direction, price band, trend, and user tags; saved views.
- *Improve me:* natural-language filter box ("pokemon under $20 up >10% this
  week") compiled to filters.

### 4. Alert rules engine
Rules scoped to a card, a watchlist, or the whole inventory. Triggers: price
crosses threshold, % move within a window, marketplace spread exceeds X after
fees, new market low. Cooldowns to prevent spam.
- *Improve me:* volatility-aware triggers (alert on unusual moves, not all
  moves) and event annotations (ban list, reprint, tournament results) shown
  as chart markers.

### 5. Push notifications
Web Push with quiet hours, per-rule channel settings, and a notification log
showing what was sent and whether it was acted on.
- *Improve me:* digest mode (one morning summary instead of a stream);
  priority scoring so only high-conviction alerts break quiet hours.

### 6. One-click buy/sell approvals
A fired rule creates a trade proposal (side, qty, price, fee-adjusted net,
evidence). Push → tap → Approve/Decline with 5-second undo. Proposals expire
(default 30 min) and record hindsight ("approving would have netted +$41").
- *Improve me:* batch approvals ("approve all 4 sells"); configurable
  auto-approve under a user-set dollar cap for trusted rules — with a hard
  daily spend limit and kill switch.

### 7. Card detail page
Image, price history chart with range switching, cross-marketplace price
table, spread panel with net-after-fees math, your holdings, rule builder.
- *Improve me:* similar-card comps ("other chase rares from this set") and a
  liquidity score so users don't chase spreads they can't exit.

## v1.1 (fast follows)

### 8. Cross-marketplace spread scanner
A standing screen: every tracked card where buy-here/sell-there beats a
threshold after fees and shipping. This is the flipper's front page.
- *Improve me:* factor seller ratings and shipping time into "executable"
  spread; alert when a spread persists >N hours (real, not a stale listing).

### 9. Fee & shipping profiles
Per-marketplace fee %, payment fees, shipping assumptions — all net-proceeds
math uses them.
- *Improve me:* learn actual fees from the user's recorded sales and flag
  when an assumption is off.

### 10. Watchlists & target prices
Cards you don't own yet with target buy prices; one-tap move from watchlist
to inventory when a buy executes.
- *Improve me:* community heat signal — how many FlipDeck users watch this
  card (anonymized, lagged so it can't be front-run).

### 11. Sold-history & performance analytics
Realized P/L over time, win rate, average hold duration, best/worst flips,
per-game breakdown.
- *Improve me:* rule-level attribution — which alert rules actually make
  money — feeding a "your best rule" insight card.

### 12. Mobile PWA polish
Installable, offline-tolerant shell; the approvals screen designed
phone-first (see `mockups/mobile-approval.html`).
- *Improve me:* home-screen widget / live activity for pending approvals.

## v2 (differentiators)

### 13. Marketplace API execution
Where terms permit, approvals place the order/listing directly instead of
deep-linking. Pluggable per marketplace, off by default, with per-day caps.
- *Improve me:* simulated "paper trading" mode first, so users (and you)
  can validate rule quality risk-free.

### 14. Price forecasting & anomaly detection
Model short-horizon direction from history, event calendar (set rotations,
bans, tournaments), and cross-market lead-lag (one market often moves first).
- *Improve me:* honest confidence display — show hit-rate of past forecasts
  next to every prediction. Never show a forecast without a track record.

### 15. Sealed product & graded cards
Track booster boxes/ETBs and graded (PSA/BGS/CGC) premiums as first-class
items with their own price feeds.
- *Improve me:* "grade-it-or-not" calculator: raw price vs. graded comps vs.
  grading fee and turnaround.

### 16. Social / copy rules
Share alert rules and watchlists; follow top flippers' public rule
performance; copy a rule with one tap.
- *Improve me:* leaderboard seasons per game to ride new-set hype cycles.

### 17. Store/B2B tier
Bulk repricing suggestions for 10k+ card inventories, team seats, POS export.
- *Improve me:* buylist optimizer — what a store should pay today given
  velocity and spread.

### 18. More games
One Piece, Star Wars Unlimited, Gundam, Flesh and Blood — adding a game is a
catalog + provider adapter, not a rebuild.
- *Improve me:* community-requested game voting to sequence the roadmap.

## Cross-cutting requirements (apply to every feature)

- **Never color-alone:** every delta is a signed number with an arrow.
- **Every list has empty/loading/error states.**
- **Every automated action has a log, an undo where possible, and a kill
  switch.**
- **Latency budget:** dashboard interactive < 2s on a mid-range phone.

## Open product questions (decide before building v1.1+)

1. Auto-approve (feature 6) — is any fully-automatic buying acceptable at
   launch, or is human-tap-required a trust feature to keep?
2. Do we normalize to one "FlipDeck price" per card, or always show
   per-marketplace prices? (Recommendation: always per-marketplace; a blended
   number hides the spread that *is* the product.)
3. Riftbound data quality is the youngest and weakest — ship it with a
   "beta data" badge or hold it until coverage is solid?
4. Is the free tier generous enough to seed community heat data (feature 10)
   without cannibalizing Flipper-tier conversions?
