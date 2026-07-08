# FlipDeck Backlog

Deferred ideas from improvement cycles, roughly ordered. The prioritizer
reads this each cycle; delete items when done (log them in IMPROVEMENTS.md)
or when rejected. Last rebuilt from the cycle-10 critique sweep.

## Engine / correctness
- Honor UserSettings.defaultMarketplaces in createProposal and evaluateWatchTargets (or remove the dead knob and fix the dashboard copy) — pair with the buysCommittedTodayFor dedupe (both touch tick.ts)
- addWatch: run target prices through normalizeTarget (NaN/Infinity/negative currently persist and can spam proposals)
- shippingFlat currency-unit fix (convert via toUsd or redefine as USD); USD-normalize cardmarket sale prices at the sell write boundary
- Dedupe buysCommittedTodayFor (tick.ts private copy vs proposals.ts helper) into a shared module (cycle 10 follow-up)
- Prune dead push subscriptions on 404/410 Gone; console fallback when no live subscription delivered
- Per-item try/catch in expiry/hindsight sweeps; structured { ok:false } errors + timingSafeEqual on POST /api/worker/tick
- Auth hygiene: magic-link consume race (conditional-claim updateMany), per-IP/email throttle, purge expired sessions/tokens in worker, upsertUserByEmail P2002 race; honest 'email not configured' dev UI
- PricePoint retention/downsampling sweep + bounded recomputeStat and card-page history queries + expired Session/MagicLinkToken cleanup
- MarketStat freshness gate in rule/watch evaluation; surface per-card staleness in UI
- Provider honesty: log/count mock-fallback engagements per tick, skip ingest instead of fabricating on real-provider failure, scale mock volatility by tick interval; surface live-vs-simulated in sidebar freshness indicator

## Features (bigger, may need own cycle)
- Card search/ingest from providers (searchCards on the provider interface, create Card rows on demand, catalog-backed top-bar search with a real Ctrl/Cmd-K handler) — L, needs its own cycle; at minimum drop the dead ⌘K placeholder
- Inventory edit panel: expose quantity/condition/tags/location (action already accepts them); add location to AddCardForm and the CSV import/export round-trip
- First-run inventory onboarding empty state (Add your first card / Import CSV CTAs instead of 'No cards match')
- Saved views in inventory (FEATURES #3) — persist named filter+sort combos in localStorage; add price-band and trend filters

## UX / UI
- Extend useActionStatus/InlineStatus to remaining call sites: AddCardForm, bulk actions in InventoryTable
- Confirmation + undo for bulk delete and rule delete; replace bulk-bar window.prompt with the inline ActionPanel pattern, show selection total value, Escape-to-clear
- Card page: 'Sell mine' should open the real sell flow instead of a bare deep link; spread-panel advice links to RuleBuilder with trigger preselected; un-hardcode the 8% floor
- Replace hand-rolled signed money/percent strings on the alerts attribution line and inventory summary with formatSignedMoney/formatSignedPercent/Delta
- Mobile polish: sidebar backdrop/click-away/Escape/scroll-lock, phone-first approvals layout per mockups/mobile-approval.html, service-worker app-shell precache + offline fallback
- Watchlist nits: TargetCell Escape-cancel ref can swallow the next commit once; card page treats price of 0 as missing in spread panel

## Schema changes (serial cycles only — no parallel worktrees)
- Quiet hours timezone correctness — needs a timezone column on UserSettings
- Per-(rule,card) cooldown instead of per-rule lastFiredAt
- PricePoint provenance/source column
