# FlipDeck Backlog

Deferred ideas from improvement cycles, roughly ordered. The prioritizer
reads this each cycle; delete items when done (log them in IMPROVEMENTS.md)
or when rejected. Rebuilt from the cycle-4 critique sweep (re-verified).

## Engine / correctness
- Wire the unused MemoryRateLimiter into provider fetches; drain-or-delete the dead dirtyCards queue (split out of cycle 8's worker item)
- requireUser() helper redirecting to /signin, replacing (await getCurrentUser())! non-null assertions on all 8 (app) pages — session-expiry crash on soft navigation, verified still present (strong candidate)
- RuleBuilder/NewRuleForm don't display createRule validation errors yet (cycle 8 follow-up)
- Quiet-hours flush sweep + digestMode morning summary; defer/lengthen expiry for proposals born in quiet hours
- createRule write-boundary validation: whitelist marketplace against MARKETPLACES, clamp cooldown/expiry/quantity, finite numeric params (unknown marketplace makes the rule silently dead)
- Auth hygiene: magic-link consume race (conditional-claim updateMany), per-IP/email throttle, purge expired sessions/tokens in worker, upsertUserByEmail P2002 race
- PricePoint retention/compaction pass + bounded recomputeStat reads + cache primarySeries per card within a tick
- MarketStat freshness gate in rule/watch evaluation; surface per-card staleness in UI; drain the dead dirtyCards queue
- Provider honesty: log/count mock-fallback engagements per tick, skip ingest instead of fabricating on real-provider failure, scale mock volatility by tick interval

## Features (bigger, may need own cycle)
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
