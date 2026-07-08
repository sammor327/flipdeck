// Race-safety and robustness tests for the worker tick.
//
// Sweeps (expireStaleProposals, recordDeclinedHindsight): must claim each row
// with a guarded updateMany, so they can never flip a proposal whose status
// changed (approved! undone!) between their read and their write — and must
// not send a notification for rows they did not transition.
//
// Rule fires (evaluateAllRules): must claim the rule's cooldown with a guarded
// lastFiredAt updateMany before creating/dispatching, so two processes that
// both pass the in-memory dedup cannot double-fire — and a guardrail block
// must never consume the cooldown.
//
// runTick: single-flight (concurrent calls coalesce onto one tick) and
// per-card error isolation (one bad card cannot abort the tick).

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { state, db, providers } = vi.hoisted(() => ({
  state: { rows: [] as Row[], view: [] as Row[] },
  db: {
    cards: [] as Row[],
    marketStats: [] as Row[],
    // Like state.rows/state.view for proposals: ruleView is the read snapshot
    // evaluateAllRules' findMany returns, ruleRows is the DB truth the guarded
    // lastFiredAt claim runs against. Divergence between the two stages the
    // cross-process race (another actor fired between our read and our claim).
    ruleRows: [] as Row[],
    ruleView: [] as Row[],
    settings: null as Row | null,
    cardLoads: 0,
    failNextCardLoad: false,
    proposalSeq: 0,
  },
  providers: {
    fetchQuotes: (async () => []) as (card: { id: string }) => Promise<any[]>,
  },
}));

vi.mock("../db", () => ({
  prisma: {
    tradeProposal: {
      // Applies the sweep's where clause to the pre-canned view — EXCEPT
      // status: the view models the read snapshot, and rows whose status
      // changed between the read and the write are exactly the race the
      // guarded updateMany must handle. Fields a row does not model are
      // treated as unconstrained. Supports the operators the sweeps use:
      // equality, null, { lte: Date }, and OR.
      findMany: async ({ where }: any) => state.view.filter((r) => whereMatches(r, where)),
      updateMany: async ({ where, data }: any) => {
        const hits = state.rows.filter(
          (r) =>
            r.id === where.id &&
            r.status === where.status &&
            (!("outcomeNote" in where) || r.outcomeNote === where.outcomeNote)
        );
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
      // Pending-dedup read in evaluateAllRules — plain equality is all it uses.
      findFirst: async ({ where }: any) =>
        state.rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `tp-${++db.proposalSeq}`, createdAt: new Date(), ...data };
        state.rows.push(row);
        return row;
      },
    },
    alertRule: {
      findMany: async () => db.ruleView,
      // The conditional cooldown claim: a compare-and-set on lastFiredAt
      // (null-vs-null and Date-vs-Date both compare like Prisma's equality).
      updateMany: async ({ where, data }: any) => {
        const hits = db.ruleRows.filter((r) => r.id === where.id && dateEquals(r.lastFiredAt, where.lastFiredAt));
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
    },
    card: {
      findMany: async () => {
        db.cardLoads++;
        if (db.failNextCardLoad) {
          db.failNextCardLoad = false;
          throw new Error("card load failed");
        }
        return db.cards;
      },
      findUnique: async ({ where }: any) => db.cards.find((c) => c.id === where.id) ?? null,
    },
    pricePoint: {
      findMany: async () => [],
      createMany: async ({ data }: any) => ({ count: data.length }),
    },
    marketStat: {
      findUnique: async ({ where }: any) => db.marketStats.find((s) => s.cardId === where.cardId) ?? null,
      upsert: async () => ({}),
    },
    userSettings: { findUnique: async () => db.settings },
    watchlistItem: { findMany: async () => [] },
    inventoryItem: { findMany: async () => [] },
    notificationLog: { findMany: async () => [] }, // held-notification flush: nothing held
  },
}));

vi.mock("../providers", () => ({
  providerFor: () => ({
    id: "test",
    supports: () => true,
    fetchQuotes: (card: any) => providers.fetchQuotes(card),
  }),
}));

function dateEquals(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.getTime() === b.getTime();
}

function whereMatches(row: Row, where: Record<string, any>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "status") continue; // see findMany comment: status races are staged, not filtered
    if (key === "OR") {
      if (!(cond as Record<string, any>[]).some((w) => whereMatches(row, w))) return false;
      continue;
    }
    if (!(key in row)) continue; // unmodeled field → unconstrained
    const val = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      if ("lte" in cond && (val == null || val.getTime() > cond.lte.getTime())) return false;
    } else if (cond === null) {
      if (val !== null) return false;
    } else if (val !== cond) {
      return false;
    }
  }
  return true;
}

vi.mock("../notifications/dispatch", () => ({ dispatchNotification: vi.fn(async () => undefined) }));

import { dispatchNotification } from "../notifications/dispatch";
import { evaluateAllRules, expireStaleProposals, recordDeclinedHindsight, runTick } from "./tick";

function row(id: string, status: string): Row {
  return {
    id,
    userId: "u1",
    cardId: "c1",
    side: "sell",
    proposedPrice: 10,
    status,
    outcomePrice: null,
    outcomeNote: null,
    card: { name: "Test Card", marketStat: { currentPrice: 12 } },
  };
}

beforeEach(() => {
  state.rows = [];
  state.view = [];
  db.cards = [];
  db.marketStats = [];
  db.ruleRows = [];
  db.ruleView = [];
  db.settings = null;
  db.cardLoads = 0;
  db.failNextCardLoad = false;
  providers.fetchQuotes = async () => [];
  vi.mocked(dispatchNotification).mockClear();
});

describe("expireStaleProposals", () => {
  it("expires still-pending rows with hindsight and notifies once each", async () => {
    const p = row("tp-1", "pending");
    state.rows = [p];
    state.view = [p];

    const expired = await expireStaleProposals(new Date());
    expect(expired).toBe(1);
    expect(p.status).toBe("expired");
    expect(p.outcomePrice).toBe(12);
    expect(typeof p.outcomeNote).toBe("string");
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1", kind: "expiry" });
  });

  it("skips (and does not notify for) a row approved after the sweep's read", async () => {
    const pending = row("tp-1", "pending");
    const approved = row("tp-2", "approved"); // approved between findMany and updateMany
    state.rows = [pending, approved];
    state.view = [pending, approved]; // the sweep read both while still pending

    const expired = await expireStaleProposals(new Date());
    expect(expired).toBe(1);
    expect(pending.status).toBe("expired");
    // The concurrently-approved proposal is untouched: no expiry flip, no note.
    expect(approved.status).toBe("approved");
    expect(approved.outcomePrice).toBeNull();
    expect(approved.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1" });
  });
});

const MINUTE_MS = 60_000;

/** A declined proposal whose horizon and (settled) undo window are in the past by default. */
function declinedRow(id: string, now: Date, overrides: Partial<Row> = {}): Row {
  return {
    id,
    userId: "u1",
    cardId: "c1",
    side: "sell",
    proposedPrice: 10,
    status: "declined",
    outcomePrice: null,
    outcomeNote: null,
    expiresAt: new Date(now.getTime() - 5 * MINUTE_MS),
    undoUntil: new Date(now.getTime() - 4 * MINUTE_MS),
    card: { name: "Test Card", marketStat: { currentPrice: 12 } },
    ...overrides,
  };
}

describe("recordDeclinedHindsight", () => {
  it("records hindsight for declined rows past their horizon and notifies exactly once each", async () => {
    const now = new Date();
    const p = declinedRow("tp-1", now);
    state.rows = [p];
    state.view = [p];

    const hindsights = await recordDeclinedHindsight(now);
    expect(hindsights).toBe(1);
    expect(p.status).toBe("declined"); // hindsight never changes status
    expect(p.outcomePrice).toBe(12);
    expect(typeof p.outcomeNote).toBe("string");
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1", kind: "hindsight" });

    // Second sweep is a no-op: the row already carries its note.
    const again = await recordDeclinedHindsight(new Date(now.getTime() + MINUTE_MS));
    expect(again).toBe(0);
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
  });

  it("leaves declined rows whose horizon is still in the future untouched", async () => {
    const now = new Date();
    const p = declinedRow("tp-1", now, { expiresAt: new Date(now.getTime() + 5 * MINUTE_MS) });
    state.rows = [p];
    state.view = [p];

    expect(await recordDeclinedHindsight(now)).toBe(0);
    expect(p.outcomePrice).toBeNull();
    expect(p.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
  });

  it("waits out a live undo window", async () => {
    const now = new Date();
    // Declined moments before expiry: horizon passed but the 5s undo is still live.
    const p = declinedRow("tp-1", now, { undoUntil: new Date(now.getTime() + 3000) });
    state.rows = [p];
    state.view = [p];

    expect(await recordDeclinedHindsight(now)).toBe(0);
    expect(p.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
  });

  it("skips rows that already carry an outcome note", async () => {
    const now = new Date();
    const p = declinedRow("tp-1", now, { outcomePrice: 11, outcomeNote: "Hindsight: already recorded." });
    state.rows = [p];
    state.view = [p];

    expect(await recordDeclinedHindsight(now)).toBe(0);
    expect(p.outcomePrice).toBe(11);
    expect(p.outcomeNote).toBe("Hindsight: already recorded.");
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
  });

  it("skips (and does not notify for) a row undone back to pending after the sweep's read", async () => {
    const now = new Date();
    const noted = declinedRow("tp-1", now);
    const undone = declinedRow("tp-2", now, { status: "pending", undoUntil: null }); // undone between findMany and updateMany
    state.rows = [noted, undone];
    state.view = [noted, undone]; // the sweep read both while still declined

    const hindsights = await recordDeclinedHindsight(now);
    expect(hindsights).toBe(1);
    expect(noted.outcomeNote).not.toBeNull();
    // The concurrently-undone proposal is untouched: no note, no notification.
    expect(undone.status).toBe("pending");
    expect(undone.outcomePrice).toBeNull();
    expect(undone.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1", kind: "hindsight" });
  });
});

// ---------------------------------------------------------------------------
// evaluateAllRules: the conditional lastFiredAt cooldown claim.
// ---------------------------------------------------------------------------

function stageCard(id: string): Row {
  const card = {
    id,
    name: `Card ${id}`,
    setCode: "SET",
    setName: "Test Set",
    collectorNumber: "1",
    finish: "nonfoil",
    scryfallId: null,
    tcgplayerId: null,
    cardmarketId: null,
    pokemonTcgId: null,
    ygoprodeckId: null,
    game: { slug: "mtg" },
  };
  db.cards.push(card);
  return card;
}

function stageStat(cardId: string, currentPrice = 10): Row {
  const stat = {
    cardId,
    currentPrice,
    median90d: currentPrice,
    delta24hPct: 0,
    delta7dPct: 0,
    bestSpreadPct: null,
    low90d: currentPrice,
    listingCount: 3,
  };
  db.marketStats.push(stat);
  return stat;
}

/** An enabled card-scoped rule that always fires (price 10 ≤ threshold 100 → buy). */
function firingRule(id: string, cardId: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    userId: "u1",
    name: `Rule ${id}`,
    enabled: true,
    action: "propose_trade",
    trigger: "threshold_below",
    params: JSON.stringify({ threshold: 100 }),
    proposeSide: "buy",
    scope: "card",
    cardId,
    cooldownMinutes: 60,
    lastFiredAt: null,
    quantity: 1,
    marketplace: "tcgplayer",
    proposalExpiryMinutes: 30,
    quietHoursRespected: true,
    ...overrides,
  };
}

describe("evaluateAllRules cooldown claim", () => {
  it("a won claim creates the proposal, notifies, and starts the cooldown", async () => {
    stageCard("c1");
    stageStat("c1");
    const rule = firingRule("r1", "c1");
    db.ruleView = [rule];
    db.ruleRows = [{ ...rule }];

    const now = new Date();
    const res = await evaluateAllRules(now);
    expect(res).toEqual({ rulesEvaluated: 1, proposalsCreated: 1 });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ ruleId: "r1", cardId: "c1", side: "buy", status: "pending" });
    expect(db.ruleRows[0].lastFiredAt).toEqual(now);
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ kind: "proposal", ruleId: "r1" });
  });

  it("a lost claim creates no proposal and sends no notification", async () => {
    stageCard("c1");
    stageStat("c1");
    const read = firingRule("r1", "c1", { lastFiredAt: null }); // evaluation read: never fired
    const otherActorFiredAt = new Date();
    db.ruleView = [read];
    // Another process (standalone worker vs. web simulateTick) fired the rule
    // between our evaluation read and our claim.
    db.ruleRows = [{ ...read, lastFiredAt: otherActorFiredAt }];

    const res = await evaluateAllRules(new Date());
    expect(res).toEqual({ rulesEvaluated: 1, proposalsCreated: 0 });
    expect(state.rows).toHaveLength(0);
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
    // The loser must not clobber the winner's cooldown either.
    expect(db.ruleRows[0].lastFiredAt).toEqual(otherActorFiredAt);
  });

  it("a lost claim on a notify-only rule dispatches nothing", async () => {
    stageCard("c1");
    stageStat("c1");
    const read = firingRule("r1", "c1", { action: "notify", lastFiredAt: null });
    db.ruleView = [read];
    db.ruleRows = [{ ...read, lastFiredAt: new Date() }]; // another actor fired after our read

    await evaluateAllRules(new Date());
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
    expect(state.rows).toHaveLength(0);
  });

  it("a guardrail-blocked fire does not consume the rule cooldown", async () => {
    stageCard("c1");
    stageStat("c1");
    db.settings = { killSwitch: true, dailySpendCap: 0, feeProfiles: null };
    const rule = firingRule("r1", "c1");
    db.ruleView = [rule];
    db.ruleRows = [{ ...rule }];

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await evaluateAllRules(new Date());
    logSpy.mockRestore();

    expect(res.proposalsCreated).toBe(0);
    expect(state.rows).toHaveLength(0);
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
    // The blocked fire never touched lastFiredAt — the rule can fire the
    // moment the guardrail lifts.
    expect(db.ruleRows[0].lastFiredAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runTick: single-flight coalescing and per-card error isolation.
// ---------------------------------------------------------------------------

describe("runTick", () => {
  it("a thrown provider error on one card still processes the others", async () => {
    stageCard("cA");
    stageCard("cB");
    providers.fetchQuotes = async (card) => {
      if (card.id === "cA") throw new Error("provider down");
      return [
        {
          marketplace: "tcgplayer",
          condition: "NM",
          priceType: "market",
          price: 10,
          currency: "USD",
          listingCount: 1,
          capturedAt: new Date(),
        },
      ];
    };

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runTick();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("card cA"), expect.any(Error));
    errSpy.mockRestore();

    // Card B ingested despite card A throwing, and every downstream sweep
    // (rules, watch targets, expiry, hindsight, flush) still ran to completion.
    expect(res).toEqual({
      cards: 2,
      quotesInserted: 1,
      proposalsCreated: 0,
      rulesEvaluated: 0,
      expired: 0,
      hindsights: 0,
      flushed: 0,
    });
  });

  it("two concurrent runTick calls coalesce onto one tick and resolve to the same result", async () => {
    stageCard("c1");

    const [a, b] = await Promise.all([runTick(), runTick()]);
    expect(a).toBe(b); // the very same TickResult object, not two equal ticks
    expect(db.cardLoads).toBe(1);

    // Once the tick settles the guard resets: the next call runs a fresh tick.
    const c = await runTick();
    expect(c).not.toBe(a);
    expect(db.cardLoads).toBe(2);
  });

  it("a rejected tick resets the single-flight guard instead of wedging it", async () => {
    db.failNextCardLoad = true;
    await expect(runTick()).rejects.toThrow("card load failed");

    const res = await runTick();
    expect(res.cards).toBe(0);
  });
});
