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
