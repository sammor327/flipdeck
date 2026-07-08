# FlipDeck Backlog

Deferred ideas from improvement cycles, roughly ordered. The prioritizer
reads this each cycle; delete items when done (log them in IMPROVEMENTS.md)
or when rejected. Last rebuilt from the cycle-10 critique sweep.

## Engine / correctness
- addWatch: run target prices through normalizeTarget (NaN/Infinity/negative persist via crafted server-action calls; an Infinity buy target fires proposals every cooldown window) — real bug, S, good first pick
- updateInventoryItem missing sold-row status guard (conditional updateMany on status in ['owned','listed']); sellInventoryItem soldFees computed from pre-claim quantity read — S bug (cycle 13 critic find)
- Magic-link token consume race — atomic updateMany claim (token, usedAt: null, expiresAt > now) in src/lib/auth.ts — S bug
- Spread-proposal price edit silently recomputes net with single-market math — detect spread legs in priceSnapshot inside editProposalPrice and recompute via the sell leg, or refuse edits on spread proposals — M bug
- Kill switch & spend-cap visibility: app-wide banner + honest empty-state copy on dashboard/alerts when killSwitch on or cap exhausted — high UX, S (strong candidate)
- Signin page 'Continue to the demo' silently loops when demo autologin disabled — gate the link — S
- computeMarketStat returns null for cards with no tcgplayer/USD series — fall back to another marketplace's USD-normalized series
- Cross-process tick double-ingest (no DB-level ingest claim) — MarketStat.updatedAt freshness skip or worker-lease row
- Worker watchdog: Promise.race hard cap around runTickBody (complement to cycle 13's push timeout)
- shippingFlat currency-unit clarification: define as USD and USD-normalize cardmarket sale prices at the sell write boundary (netProceeds call sites already pass USD)
- Per-item try/catch in expiry/hindsight sweeps; structured { ok:false } errors + timingSafeEqual on POST /api/worker/tick
- Auth hygiene: magic-link consume race (conditional-claim updateMany), per-IP/email throttle, purge expired sessions/tokens in worker, upsertUserByEmail P2002 race; honest 'email not configured' dev UI
- PricePoint retention/downsampling sweep + bounded recomputeStat and card-page history queries + expired Session/MagicLinkToken cleanup
- MarketStat freshness gate in rule/watch evaluation; surface per-card staleness in UI
- Provider honesty: log/count mock-fallback engagements per tick, skip ingest instead of fabricating on real-provider failure, scale mock volatility by tick interval; surface live-vs-simulated in sidebar freshness indicator

## Features (bigger, may need own cycle)
- Card search/ingest from providers (searchCards on the provider interface, create Card rows on demand, catalog-backed top-bar search with a real Ctrl/Cmd-K handler) — L, needs its own cycle; at minimum drop the dead ⌘K placeholder
- Inventory edit panel: expose quantity/condition/tags/location (action already accepts them); add location to AddCardForm and the CSV import/export round-trip
- Saved views in inventory (FEATURES #3) — persist named filter+sort combos in localStorage; add price-band and trend filters

## UX / UI
- Alert rules cannot be edited — updateRule server action (reuse validateRuleInput, preserve attribution) + prefilled RuleBuilder edit affordance — M, high value
- Batch approvals ('Approve all N' via per-proposal conditional claims, partial results, batch undo) — M, FEATURES #6
- Notification feed titles are dead text — wrap in <Link> to stored deepLink — S
- formatCountdown unbounded mm:ss ('347:12') — render '5h 47m' above the hour, '2d 3h' above 24h — S
- Alerts tabs not URL-addressable — sync to ?tab= param; point analytics attribution + dashboard rules tile at it — S
- Sold rows show '—' in P/L % despite known realized P/L — realizedPct in queries.ts + sold-aware InventoryTable switch — S
- CSV export formula-injection escaping; import can't parse quoted embedded newlines its own export emits — S
- Seed richer demo: 10-15 staggered sold rows with wins AND losses, a notify-only rule, held quiet-hours notifications for the digest path — S
- Undo for bulk delete; rule-delete confirmation on the alerts page (confirm-only bulk delete shipped cycle 12)
- Card page: 'Sell mine' should open the real sell flow instead of a bare deep link; spread-panel advice links to RuleBuilder with trigger preselected; un-hardcode the 8% floor
- Replace hand-rolled signed money/percent strings on the alerts attribution line and inventory summary with formatSignedMoney/formatSignedPercent/Delta
- Mobile polish: sidebar backdrop/click-away/Escape/scroll-lock, phone-first approvals layout per mockups/mobile-approval.html, service-worker app-shell precache + offline fallback
- Watchlist nits: TargetCell Escape-cancel ref can swallow the next commit once; card page treats price of 0 as missing in spread panel

## Schema changes (serial cycles only — no parallel worktrees)
- Quiet hours timezone correctness — needs a timezone column on UserSettings
- Per-(rule,card) cooldown instead of per-rule lastFiredAt
- PricePoint provenance/source column
