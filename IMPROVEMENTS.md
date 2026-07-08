# FlipDeck Improvement Log

Autonomous multi-agent improvement loop. Each cycle: critique vs pitch deck →
prioritize → parallel implementation in isolated worktrees → test → review →
merge → push. One cycle per hour.

## Baseline — 2026-07-07 21:32

- Branch `main` @ `3081d53`
- `npm run typecheck`: pass
- `npm test`: 45/45 pass (4 files)
- Stack: Next.js 14, Prisma 5 (SQLite), Tailwind, vitest

<!-- Cycle entries are appended below, newest last. -->

## Cycle 1 — 2026-07-07 ~21:35–21:55

30 findings from 4 critique agents → 3 selected, 3 implemented, 3 approved, 3 merged.

1. **Enforce kill switch & daily spend cap** — the app's headline safety
   guardrail was a no-op (stored in settings, read by nothing). New pure
   `src/lib/guardrails.ts` + 8 tests; worker `createProposal` now blocks on
   kill switch and on buys exceeding the daily cap (pending+approved buys
   since midnight); blocked fires don't consume the rule cooldown;
   notifications held by kill switch are logged but not delivered.
2. **Harden auth & worker endpoints** — demo auto-login is now dev-only
   (gated on `NODE_ENV !== "production"`, opt-out via
   `DISABLE_DEMO_AUTOLOGIN=1`), the any-user DB fallback is gone,
   `simulateTick` requires a signed-in user, and `/api/worker/tick` fails
   closed (503) in production when `WORKER_TRIGGER_KEY` is unset.
3. **Condition input validation** — bad CSV rows could NaN-poison portfolio
   math. New `normalizeCondition` (codes, labels, aliases, case/whitespace
   tolerant) at all write boundaries; `conditionMultiplier` with NM fallback
   at all read paths; unknown CSV conditions skip the row with a clear
   message; +10 tests.

Tests: 45 → 63 passing. Deferred ideas moved to BACKLOG.md.

## Cycle 2 — 2026-07-07 ~22:17–22:35 (backlog mode)

3 selected from BACKLOG.md, 3 implemented, 3 approved, 3 merged.

1. **Close the act loop** — approving a proposal previously only flipped its
   status; the app's core promise was unfulfilled. Approving a BUY now adds
   the card to inventory and clears it from the watchlist; approving a SELL
   consumes holdings oldest-first (with a quantity split when needed) and
   apportions fees exactly across sold rows. Undo reverses everything
   precisely via an effect record stored in the proposal snapshot. New pure
   planner `src/lib/actLoop.ts` + 8 tests.
2. **Honor user fee profiles** — worker proposals and the card-page net
   column used hardcoded default fees, ignoring the Settings fee profiles.
   New `mergeFeeProfiles` helper (NaN-safe validation, falls back to
   defaults) now feeds both surfaces; copy updated to say "your profile".
   +4 tests.
3. **Sold view + realized P/L** — sold cards no longer vanish: inventory has
   a Status filter (Active/Owned/Listed/Sold/All), sold rows show sale price
   and realized P/L, footer and summary strip surface total realized P/L.
   +5 tests.

Tests: 63 → 80 passing.

## Cycle 3 — 2026-07-07 ~23:17–23:40 (backlog mode)

3 selected from BACKLOG.md, 3 implemented, 3 approved, 3 merged.

1. **Watchlist target prices are live** — targets were stored but never
   evaluated and not editable. New pure `src/lib/watchTargets.ts` (+9 tests);
   the worker tick now fires buy proposals when price ≤ target buy and sell
   proposals when price ≥ target sell (only if you hold copies), with 6h
   cooldown dedup, guardrails (kill switch/spend cap), fee-profile math, and
   notifications. Watchlist table gained click-to-edit target cells.
2. **Sold-view fixes + Unlist** — P/L column now sorts by realized P/L for
   sold rows (nulls last); legacy sales with no recorded price no longer
   booked as full-cost losses in the summary; listed rows gained an Unlist
   button (action existed, had no UI caller). +2 tests.
3. **Spread freshness window** — cross-market spreads now ignore quotes older
   than 48h (configurable), so a stale listing can't fabricate arbitrage; the
   card-page spread panel filters the same way while the price table still
   shows stale rows. +6 tests.

Tests: 80 → 97 passing.

## Cycle 4 — 2026-07-08 ~00:17–00:50 (critique mode)

Fresh 4-critic sweep: 29 findings → 3 selected, 3 implemented, 3 approved,
3 merged. Backlog rebuilt from re-verified deferred list.

1. **Atomic proposal lifecycle** — approve/decline/undo/expire were racy:
   double-click or concurrent approve could double-apply inventory effects.
   All transitions now use conditional-claim `updateMany` (+transactions
   around claim + inventory effects), losers get "Already <status>" /
   "Undo window elapsed". Worker expiry sweep can no longer clobber a row
   approved mid-sweep. +8 tests (incl. concurrent double-approve/undo).
2. **Money-input hardening** — sell flow's local fee merge could NaN
   `soldFees` from partial overrides (now uses `mergeFeeProfiles`); prices
   and marketplaces validated at every write boundary; settings updates
   validate spend cap, clamp quiet hours, sanitize fee-profile JSON,
   whitelist marketplaces; YGOPRODeck cardmarket quotes fixed USD → EUR.
   +6 tests.
3. **Approve deep-link recovery** — the post-approve `window.open` was
   popup-blocked in every browser (user gesture consumed by the server
   action), dead-ending the act loop. Now an "Open listing ↗" button on the
   undo bar and a recoverable link in alert history.

Tests: 97 → 111 passing.

## Cycle 5 — 2026-07-08 ~01:17–01:40 (backlog mode)

3 selected from BACKLOG.md, 3 implemented, 3 approved, 3 merged.

1. **Expired proposals no longer masquerade as pending** — sidebar badge,
   dashboard tile, and approvals list now filter on `expiresAt > now`, and
   approve/decline claims include the expiry check atomically, so a stale
   tab can't act on an expired proposal. +4 tests.
2. **Declined-proposal hindsight** — the pitch-deck promise "declining would
   have netted +$41" was a dead notification kind. New worker sweep records
   outcome price/note on lapsed declines and dispatches exactly-once
   hindsight notifications (idempotent claim, undo-window aware). +5 tests.
3. **Inline sell/list/edit panel** — `window.prompt` money flows replaced
   with an inline panel: live net-after-fees preview using the user's own
   fee profiles (same pure function the server uses), projected realized
   P/L, marketplace select, inline validation errors, keyboard support.
   Verified live in a browser against a dev server.

Tests: 111 → 120 passing. Known follow-up queued: dashboard card list still
renders unswept expired proposals (cosmetic; actions are guarded).

## Cycle 6 — 2026-07-08 ~02:17–02:40 (backlog mode)

3 selected from BACKLOG.md, 3 implemented, 3 approved, 3 merged.

1. **Dashboard approvals panel consistency** — last cosmetic hole from
   cycle 5's expiry work: the home-page card list now filters unswept
   expired proposals, so tile, sub-header, cards, and "View all N" agree.
   Verified live in a browser before/after.
2. **Per-user spread everywhere** — the spread scanner (the "flipper's
   front page"), Top Movers, and mover rows computed spreads from cached
   default-fee stats. New pure `src/lib/spreads.ts` computes best spread
   from the viewer's own fee profiles at read time (48h freshness, EUR
   conversion, batched loading). +9 tests.
3. **Fast lane covers watch targets** — cards with watchlist targets but no
   alert rule were excluded from the 5-min fast lane (targets could lag an
   hour); the fast-lane id set is now rules ∪ watch-targets via new
   `src/lib/fastLane.ts`, and the sidebar fast-lane count reports that
   set's real size (was both inflatable and falsely zero). +7 tests.

Tests: 120 → 136 passing.

## Cycle 7 — 2026-07-08 ~03:17–03:50 (critique mode)

Fresh 4-critic sweep: 29 findings → 3 selected, 3 implemented, 3 approved,
3 merged.

1. **Notify-only rules work; spread rules use your fees** — "Notify only"
   rules silently created trade proposals (or nothing, for zero-holdings
   sells); they now dispatch info notifications with cooldown and skip
   guardrails/spend-cap. And 'spread' rule triggers now evaluate the
   owner's after-fee spread (reusing cycle 6's spreads module, batched +
   cached per user) instead of the default-fee cached stat. +8 tests.
2. **Push → tap → done** — the pitch deck's headline loop: Approve/Decline
   buttons on push notifications now actually work end-to-end. New
   authenticated POST /api/proposals/[id]/approve|decline route delegating
   to the atomic server actions; the service worker attaches buttons only
   to proposal pushes, POSTs on tap, and shows a confirmation notification
   with the marketplace deep link. Live-verified with curl: 200/409/404
   paths all correct.
3. **Inventory write-boundary status guards** — sell/list/unlist/bulkList
   now conditionally claim rows by status (cycle-4 pattern), so a stale tab
   can't overwrite a sale's history ("Already sold" instead); re-watching a
   card no longer clobbers its targets/notes. +12 tests incl. a mocked
   concurrent flip-to-sold.

Tests: 136 → 156 passing.

## Cycle 8 — 2026-07-08 ~04:17–04:40 (backlog mode)

3 selected from BACKLOG.md, 3 implemented, 3 approved, 3 merged.

1. **Worker robustness** — single-flight guard coalesces concurrent
   `runTick` calls (all three entry points); run.ts uses a self-scheduling
   loop instead of setInterval; per-card try/catch so one bad provider call
   can't abort rule/watch/expiry/hindsight sweeps; and rule firing uses a
   conditional lastFiredAt compare-and-set claim, closing the cross-process
   double-fire race. Guardrail-blocked fires still never consume cooldown.
   +7 tests.
2. **createRule validation** — a rule with an unknown marketplace was
   silently dead. New pure `src/lib/ruleValidation.ts`: whitelists
   marketplace/trigger/scope/action, rejects NaN/Infinity and missing
   thresholds with human-readable errors, clamps name/window/lookback/
   quantity/cooldown/expiry ranges. +16 tests.
3. **Edit price on approvals** — mockup parity: pending approvals get an
   inline price editor; the server recomputes net-after-fees exactly like
   the worker (user fee profiles, sell netProceeds / buy edge vs median),
   persisted via conditional claim so it can't race approve/expiry. +5 tests.

Tests: 156 → 184 passing.

## Cycle 9 — 2026-07-08 ~05:17–05:35 (backlog mode)

3 selected from BACKLOG.md, 3 implemented, 3 approved, 3 merged.

1. **`requireUser()`** — an expired session hit `(await getCurrentUser())!`
   non-null assertions and crashed to the error boundary; all 8 app pages +
   layout now redirect to /signin. Verified at runtime: signed-out hits 307
   to /signin, signed-in unchanged.
2. **Rule-form errors surfaced** — cycle 8's validation errors now render
   inline in RuleBuilder and NewRuleForm (form stays open, inputs intact,
   stale errors cleared on edit/reopen).
3. **Provider rate limiting** — the never-wired MemoryRateLimiter now wraps
   all real provider fetches (per-API budgets: scryfall 8/s, pokemontcg
   2/s, ygoprodeck 5/s, lorcast 5/s; starvation falls back to mock data
   after 4s instead of hammering). Dead `dirtyCards` queue deleted
   end-to-end. +9 tests.

Tests: 184 → 193 passing.
