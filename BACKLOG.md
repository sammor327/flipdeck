# FlipDeck Backlog

Deferred ideas from improvement cycles, roughly ordered. The prioritizer
reads this each cycle; delete items when done (log them in IMPROVEMENTS.md)
or when rejected.

## Engine / correctness
- Watchlist target prices are inert — evaluate targetBuy/targetSell in the worker tick and add target-editing UI
- Worker robustness: re-entrancy guard across the three runTick entry points, per-card try/catch, always run expireStaleProposals, self-scheduling setTimeout loop instead of setInterval
- Flush quiet-hours-held notifications when the window ends; implement digestMode as the morning-summary mechanism
- Best-spread freshness window in src/lib/stats.ts so stale quotes can't fabricate cross-market spreads
- Wire dead plumbing: drain dirtyCards in rule evaluation, batch MarketStat loads, rate-limit provider fetches
- Broader zod validation across all server-action inputs (marketplace strings, finite/bounded numbers)

## Schema changes (serial cycles only — no parallel worktrees)
- Quiet hours timezone correctness — needs a timezone column on UserSettings
- Per-(rule,card) cooldown instead of per-rule lastFiredAt

## UX / UI
- Sold-view follow-ups (cycle 2 review nits): P/L $ column sorts by unrealizedPL so sorting is inert in the Sold view; summary strip counts legacy null-soldPrice sales as full-cost loss while the row shows an em-dash
- Replace window.prompt sell/list/edit flows in InventoryTable with an inline panel showing net-after-fees preview and post-sale confirmation
- Add confirmation/undo to destructive actions (bulk delete in InventoryTable, rule delete in RuleRow)
- Shared toast/inline-feedback primitive; wire error branches of createRule, WatchButton, AddCardForm, bulk actions through it
- Thread the default-marketplace setting into series/stat queries (or add a marketplace switcher on the card chart)
- Real cross-catalog top-bar search with a working Cmd/Ctrl-K shortcut (or honest placeholder copy)
- Mobile-first approval view per mockups/mobile-approval.html: full-width CTA, x-of-n counter, safety footer
- Add Unlist affordance for listed inventory rows (unlistInventoryItem exists but has no UI caller)
- Small polish: hardcoded '8% floor' copy, hand-rolled percent formatting on inventory summary, bare chart empty state, freshness stamp on inventory header

## Auth / infra
- Magic-link flow: implement SMTP_URL delivery and surface the dev link on the /signin confirmation screen

## Data / demo quality
- Seed improvements: 90d cardmarket/eBay history, real external catalog IDs, more sold items for analytics demos
