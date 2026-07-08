# FlipDeck Backlog

Deferred ideas from improvement cycles, roughly ordered. The prioritizer
reads this each cycle; delete items when done (log them in IMPROVEMENTS.md)
or when rejected. Rebuilt from the cycle-4 critique sweep (re-verified).

## Engine / correctness
- 'Spread' rule trigger per-user fees in the evaluator (tick.ts ctx.bestSpreadPct still uses the default-fee cached stat) — reuse the new src/lib/spreads.ts helper (natural follow-up to cycle 6)
- Worker robustness: single-flight guard across the three runTick entry points, self-scheduling setTimeout loop, per-card/per-proposal try/catch, wire the unused rate limiter
- Flush quiet-hours-held notifications when the window ends; implement digestMode as the morning-summary mechanism
- PricePoint retention/compaction pass + bounded recomputeStat reads — unbounded growth grinds the worker down
- MarketStat staleness surfaced in UI ('prices as of X — worker may be stopped') and skip rule evaluation on frozen stats
- Wire dead plumbing: drain dirtyCards in rule evaluation, batch MarketStat loads

## Features (bigger, may need own cycle)
- Push notification Approve/Decline action buttons are dead — branch on event.action in public/sw.js and add authenticated POST /api/proposals/[id]/approve|decline routes reusing the act-loop logic
- Card search/ingest from providers (searchCards on the provider interface, create Card rows on demand, CSV import creates unmatched catalog entries) — L effort, core Track promise
- Analytics page: win rate, avg hold duration, best/worst flips, per-game breakdown from sold rows (FEATURES #11)
- Saved views in inventory (FEATURES #3) — persist named filter+sort combos in localStorage; add price-band and trend filters
- 'Edit price' on ApprovalCard per mockup — server action to update proposedPrice on a still-pending proposal with fee recompute
- Top-bar search should hit the card catalog with links/Watch buttons, and implement or drop the advertised Cmd/Ctrl-K shortcut

## UX / UI
- Confirmation/undo for bulk delete and rule delete (contradicts 'every action has an undo' copy); bulk-bar prompts are still window.prompt-based; listed row's Sell prefill could use listedPrice
- Shared toast/inline-feedback primitive; wire dropped error branches in RuleBuilder, NewRuleForm, WatchButton, TargetCell, AddCardForm, bulk actions
- requireUser() helper redirecting to /signin instead of non-null assertions on every (app) page (session-expiry crash)
- Mobile polish: sidebar backdrop/click-away + Escape, phone-first approval layout per mockups/mobile-approval.html
- Watchlist follow-ups (cycle 3 nits): TargetCell Escape-cancel ref can swallow the next commit once; server-action validation errors silently ignored client-side; card page treats price of 0 as missing in spread panel
- SettingsForm shows "Saved" even when the action rejects (cycle 4 nit)
- Small polish: hardcoded '8% floor' copy, hand-rolled percent formatting on inventory summary, bare chart empty state, freshness stamp on inventory header

## Auth / infra
- Magic-link honesty: 'email delivery not configured' state, per-IP/email throttle, purge expired sessions/tokens in the worker

## Data / demo quality
- Provider fallback observability (log/count mock fallbacks per tick, provenance on PricePoint — source column is a schema change, serial cycle) + seed real external catalog ids
- Seed demo decay: longer pending-proposal expiries, 90d cardmarket/eBay backfill, 8-10 sold items for analytics

## Schema changes (serial cycles only — no parallel worktrees)
- Quiet hours timezone correctness — needs a timezone column on UserSettings
- Per-(rule,card) cooldown instead of per-rule lastFiredAt
- PricePoint provenance/source column
