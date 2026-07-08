// evaluateAllRules behavior tests (cycle 7):
//   - action:'notify' rules dispatch an info alert, start the cooldown, and
//     never create a TradeProposal — including sell rules with zero holdings,
//     which previously produced nothing at all.
//   - trigger:'spread' rules evaluate the OWNER's after-fee spread from fresh
//     NM quotes (userBestSpreads + mergeFeeProfiles), not the default-fee
//     cached MarketStat.bestSpreadPct — so a high fee override suppresses a
//     fire the cached stat would have produced, and a user with no settings
//     row fires from the same numbers the read surfaces show.
//
// The prisma mock is state-driven (like tick.test.ts): tests stage rows in
// `state`, and write calls are recorded in `calls` for assertions.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { state, calls } = vi.hoisted(() => ({
  state: {
    rules: [] as Row[],
    stats: new Map<string, Row>(), // cardId → MarketStat row
    series: [] as Row[], // primarySeries pricePoints (tcgplayer NM market)
    spreadPoints: [] as Row[], // fresh NM quotes served to the spread batch query
    settings: null as Row | null, // UserSettings row (or none)
    card: null as Row | null, // Card row
    holdings: [] as Row[], // InventoryItems (sell-side holdings gate)
    pendingProposal: null as Row | null, // dedup findFirst result
  },
  calls: {
    proposalsCreated: [] as Row[],
    ruleUpdates: [] as Row[],
    spreadQueries: [] as Row[], // where clauses of the batched spread query
    settingsReads: [] as string[], // userIds passed to userSettings.findUnique
  },
}));

vi.mock("../db", () => ({
  prisma: {
    alertRule: {
      findMany: async () => state.rules,
      // The conditional cooldown claim (compare-and-set on lastFiredAt).
      // state.rules is both the read snapshot and the DB truth here, so claims
      // always win — cross-process lost-claim races are covered in tick.test.ts.
      updateMany: async (args: any) => {
        calls.ruleUpdates.push(args);
        const hits = state.rules.filter(
          (r) =>
            r.id === args.where.id &&
            (r.lastFiredAt?.getTime() ?? null) === (args.where.lastFiredAt?.getTime() ?? null)
        );
        for (const r of hits) Object.assign(r, args.data);
        return { count: hits.length };
      },
    },
    marketStat: {
      findUnique: async ({ where }: any) => state.stats.get(where.cardId) ?? null,
    },
    pricePoint: {
      // primarySeries constrains cardId to a single id; the spread batch uses
      // cardId: { in: [...] } — that tells the two call sites apart.
      findMany: async ({ where }: any) => {
        if (typeof where.cardId === "string") return state.series;
        calls.spreadQueries.push(where);
        return state.spreadPoints;
      },
    },
    tradeProposal: {
      findFirst: async () => state.pendingProposal,
      findMany: async () => [], // buysCommittedTodayFor
      create: async ({ data }: any) => {
        const row = { id: `tp-${calls.proposalsCreated.length + 1}`, ...data };
        calls.proposalsCreated.push(row);
        return row;
      },
    },
    card: {
      findUnique: async () => state.card,
    },
    userSettings: {
      findUnique: async ({ where }: any) => {
        calls.settingsReads.push(where.userId);
        return state.settings;
      },
    },
    inventoryItem: {
      findMany: async () => state.holdings,
    },
  },
}));

vi.mock("../notifications/dispatch", () => ({ dispatchNotification: vi.fn(async () => undefined) }));

vi.mock("../fastLane", () => ({ resolveRuleCardIds: vi.fn(async () => ["c1"]) }));

import { dispatchNotification } from "../notifications/dispatch";
import { evaluateAllRules } from "./tick";

function rule(overrides: Row = {}): Row {
  return {
    id: "r1",
    userId: "u1",
    name: "Test rule",
    scope: "card",
    cardId: "c1",
    trigger: "threshold_above",
    params: JSON.stringify({ threshold: 10 }),
    action: "notify",
    proposeSide: "auto",
    quantity: 1,
    marketplace: null,
    cooldownMinutes: 360,
    proposalExpiryMinutes: 30,
    quietHoursRespected: true,
    enabled: true,
    lastFiredAt: null,
    ...overrides,
  };
}

function stat(overrides: Row = {}): Row {
  return {
    cardId: "c1",
    currentPrice: 12,
    delta24hPct: 5,
    delta7dPct: null,
    bestSpreadPct: null,
    low90d: null,
    median90d: null,
    listingCount: null,
    ...overrides,
  };
}

/** Fresh NM quotes: buy tcgplayer @ $10, sell ebay @ $15. Under default fees
 *  that nets +30.1% (fires ≥10%); under a 90% override it is deeply negative. */
function freshSpreadPoints(now: Date): Row[] {
  return [
    { cardId: "c1", marketplace: "tcgplayer", price: 10, currency: "USD", priceType: "market", capturedAt: now },
    { cardId: "c1", marketplace: "ebay", price: 15, currency: "USD", priceType: "sold", capturedAt: now },
  ];
}

beforeEach(() => {
  state.rules = [];
  state.stats = new Map();
  state.series = [];
  state.spreadPoints = [];
  state.settings = null;
  state.card = { id: "c1", name: "Test Card", setName: "Test Set", setCode: "TST", game: { slug: "mtg" } };
  state.holdings = [];
  state.pendingProposal = null;
  calls.proposalsCreated = [];
  calls.ruleUpdates = [];
  calls.spreadQueries = [];
  calls.settingsReads = [];
  vi.mocked(dispatchNotification).mockClear();
});

describe("evaluateAllRules — notify-only rules", () => {
  it("dispatches an info alert, never creates a proposal, and starts the cooldown", async () => {
    const now = new Date();
    state.rules = [rule({ action: "notify" })]; // threshold_above 10, price 12 → fires
    state.stats.set("c1", stat());

    const { rulesEvaluated, proposalsCreated } = await evaluateAllRules(now);

    expect(rulesEvaluated).toBe(1);
    expect(proposalsCreated).toBe(0);
    expect(calls.proposalsCreated).toHaveLength(0);
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    const input = vi.mocked(dispatchNotification).mock.calls[0][0];
    expect(input).toMatchObject({ userId: "u1", kind: "info", ruleId: "r1", allowInQuietHours: false });
    expect(input.title).toContain("Test Card");
    expect(input.deepLink).toContain("/cards/c1");
    expect(input.proposalId).toBeUndefined();
    // Cooldown starts via the conditional claim: the where carries the
    // lastFiredAt read at evaluation time (null — never fired).
    expect(calls.ruleUpdates).toEqual([{ where: { id: "r1", lastFiredAt: null }, data: { lastFiredAt: now } }]);
  });

  it("notify sell rule with zero holdings still notifies (no holdings gate)", async () => {
    state.rules = [rule({ action: "notify", proposeSide: "sell" })];
    state.stats.set("c1", stat());
    state.holdings = []; // user owns zero copies

    await evaluateAllRules(new Date());

    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ kind: "info", ruleId: "r1" });
    expect(calls.proposalsCreated).toHaveLength(0);
    expect(calls.ruleUpdates).toHaveLength(1);
  });

  it("propose_trade sell rule with zero holdings still creates nothing (unchanged)", async () => {
    state.rules = [rule({ action: "propose_trade", proposeSide: "sell" })];
    state.stats.set("c1", stat());
    state.holdings = [];

    const { proposalsCreated } = await evaluateAllRules(new Date());

    expect(proposalsCreated).toBe(0);
    expect(calls.proposalsCreated).toHaveLength(0);
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
    expect(calls.ruleUpdates).toHaveLength(0); // blocked fires never start the cooldown
  });

  it("does not notify while the rule is cooling down", async () => {
    const now = new Date();
    state.rules = [rule({ action: "notify", lastFiredAt: new Date(now.getTime() - 60_000), cooldownMinutes: 360 })];
    state.stats.set("c1", stat());

    await evaluateAllRules(now);

    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
    expect(calls.ruleUpdates).toHaveLength(0);
  });
});

describe("evaluateAllRules — per-user spread evaluation", () => {
  it("does NOT fire when the owner's fee overrides eat the spread, even though the cached stat exceeds the threshold", async () => {
    const now = new Date();
    state.rules = [rule({ trigger: "spread", params: JSON.stringify({ spreadPct: 10 }), action: "notify" })];
    // Cached default-fee stat says 25% — the old code would have fired on this.
    state.stats.set("c1", stat({ currentPrice: 10, bestSpreadPct: 25 }));
    state.spreadPoints = freshSpreadPoints(now);
    const punitive = { feePct: 90, paymentFeePct: 0, shippingFlat: 0 };
    state.settings = {
      userId: "u1",
      feeProfiles: JSON.stringify({ tcgplayer: punitive, cardmarket: punitive, ebay: punitive }),
    };

    const { proposalsCreated } = await evaluateAllRules(now);

    expect(proposalsCreated).toBe(0);
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
    expect(calls.proposalsCreated).toHaveLength(0);
    expect(calls.ruleUpdates).toHaveLength(0);
    // The batched quote query mirrors userSpreadMap: fresh NM market|sold rows.
    expect(calls.spreadQueries).toHaveLength(1);
    expect(calls.spreadQueries[0]).toMatchObject({
      cardId: { in: ["c1"] },
      condition: "NM",
      priceType: { in: ["market", "sold"] },
    });
    expect(calls.settingsReads).toEqual(["u1"]);
  });

  it("fires from the per-user computation under default fees (no settings row), not the cached stat", async () => {
    const now = new Date();
    state.rules = [rule({ trigger: "spread", params: JSON.stringify({ spreadPct: 10 }), action: "propose_trade" })];
    // Cached stat has NO spread at all — only the per-user path can fire.
    state.stats.set("c1", stat({ currentPrice: 10, bestSpreadPct: null, median90d: 15 }));
    state.spreadPoints = freshSpreadPoints(now);
    state.settings = null; // no settings row → mergeFeeProfiles falls back to defaults

    const { proposalsCreated } = await evaluateAllRules(now);

    expect(proposalsCreated).toBe(1);
    expect(calls.proposalsCreated).toHaveLength(1);
    const proposal = calls.proposalsCreated[0];
    expect(proposal).toMatchObject({ userId: "u1", cardId: "c1", ruleId: "r1", side: "buy", status: "pending" });
    // The evidence carries the owner's spread ($10 → $15 minus 13.25% eBay fees = +30.1%).
    expect(JSON.parse(proposal.priceSnapshot)).toMatchObject({ spreadPct: 30.1 });
    expect(calls.ruleUpdates).toEqual([{ where: { id: "r1", lastFiredAt: null }, data: { lastFiredAt: now } }]);
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ kind: "proposal", proposalId: "tp-1", ruleId: "r1" });
  });

  it("does not fire when fewer than two marketplaces have fresh quotes, whatever the cached stat says", async () => {
    const now = new Date();
    state.rules = [rule({ trigger: "spread", params: JSON.stringify({ spreadPct: 10 }), action: "notify" })];
    state.stats.set("c1", stat({ currentPrice: 10, bestSpreadPct: 25 }));
    // One fresh quote + one stale (3 days old) → the stale row is dropped,
    // leaving a single marketplace → no computable spread → no fire.
    state.spreadPoints = [
      { cardId: "c1", marketplace: "tcgplayer", price: 10, currency: "USD", priceType: "market", capturedAt: now },
      { cardId: "c1", marketplace: "ebay", price: 15, currency: "USD", priceType: "sold", capturedAt: new Date(now.getTime() - 72 * 3600_000) },
    ];

    await evaluateAllRules(now);

    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
    expect(calls.proposalsCreated).toHaveLength(0);
    expect(calls.ruleUpdates).toHaveLength(0);
  });

  it("loads the owner's settings once across several spread rules (per-user cache)", async () => {
    const now = new Date();
    state.rules = [
      rule({ id: "r1", trigger: "spread", params: JSON.stringify({ spreadPct: 99 }), action: "notify" }),
      rule({ id: "r2", trigger: "spread", params: JSON.stringify({ spreadPct: 99 }), action: "notify" }),
    ];
    state.stats.set("c1", stat({ currentPrice: 10 }));
    state.spreadPoints = freshSpreadPoints(now);

    await evaluateAllRules(now);

    expect(calls.settingsReads).toEqual(["u1"]); // one read, second rule hits the cache
    expect(calls.spreadQueries).toHaveLength(2); // but each rule batches its own card set
  });
});

describe("evaluateAllRules — overnight proposal actionability (cycle 10)", () => {
  /** Owner sleeps 22:00 → 07:00; kill switch off, no spend cap. */
  function quietSettings(overrides: Row = {}): Row {
    return {
      userId: "u1",
      quietHoursEnabled: true,
      quietHoursStart: 1320, // 22:00
      quietHoursEnd: 420, //     07:00
      pushEnabled: true,
      digestMode: false,
      killSwitch: false,
      dailySpendCap: 0,
      feeProfiles: null,
      ...overrides,
    };
  }

  /** A propose_trade rule that always fires (price 12 ≤ threshold 100 → buy). */
  function buyRule(overrides: Row = {}): Row {
    return rule({
      action: "propose_trade",
      trigger: "threshold_below",
      params: JSON.stringify({ threshold: 100 }),
      proposeSide: "buy",
      proposalExpiryMinutes: 30,
      ...overrides,
    });
  }

  it("extends expiresAt to quiet-hours end + 30 min when a respecting rule fires overnight, and the push states the real expiry", async () => {
    const now = new Date(2026, 6, 7, 23, 30); // inside the window, before midnight
    state.rules = [buyRule({ quietHoursRespected: true })];
    state.stats.set("c1", stat());
    state.settings = quietSettings();

    const { proposalsCreated } = await evaluateAllRules(now);

    expect(proposalsCreated).toBe(1);
    // Tomorrow 07:00 + 30 min grace — still pending when the morning flush lands.
    expect(calls.proposalsCreated[0].expiresAt).toEqual(new Date(2026, 6, 8, 7, 30));
    const input = vi.mocked(dispatchNotification).mock.calls[0][0];
    expect(input.body).toContain("expires in 480 min"); // 23:30 → 07:30 is 8h, not the configured 30
  });

  it("keeps the configured expiry outside quiet hours", async () => {
    const now = new Date(2026, 6, 7, 12, 0);
    state.rules = [buyRule({ quietHoursRespected: true })];
    state.stats.set("c1", stat());
    state.settings = quietSettings();

    await evaluateAllRules(now);

    expect(calls.proposalsCreated[0].expiresAt).toEqual(new Date(now.getTime() + 30 * 60000));
    expect(vi.mocked(dispatchNotification).mock.calls[0][0].body).toContain("expires in 30 min");
  });

  it("keeps the configured expiry when the rule breaks through quiet hours (push is not held)", async () => {
    const now = new Date(2026, 6, 7, 23, 30);
    state.rules = [buyRule({ quietHoursRespected: false })];
    state.stats.set("c1", stat());
    state.settings = quietSettings();

    await evaluateAllRules(now);

    expect(calls.proposalsCreated[0].expiresAt).toEqual(new Date(now.getTime() + 30 * 60000));
    expect(vi.mocked(dispatchNotification).mock.calls[0][0].body).toContain("expires in 30 min");
  });
});
