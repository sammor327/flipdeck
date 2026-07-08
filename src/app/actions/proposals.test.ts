// Race-safety tests for the proposal actions: approve/decline/undo must claim
// the row with a conditional updateMany BEFORE applying side effects, so a
// doubled request (two tabs, a retry) can never double-apply inventory effects.
// Prisma is replaced with an in-memory stand-in — the atomicity under test is
// the conditional-claim pattern, not SQLite itself.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { db, prismaFake, resetDb } = vi.hoisted(() => {
  const db = {
    tradeProposals: [] as Row[],
    portfolios: [] as Row[],
    inventoryItems: [] as Row[],
    watchlistItems: [] as Row[],
    marketStats: [] as Row[],
    notificationLogs: [] as Row[],
    userSettings: [] as Row[],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}${++seq}`;

  function matchValue(rowVal: any, cond: any): boolean {
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      if ("gt" in cond) return rowVal != null && rowVal > cond.gt;
      if ("in" in cond) return (cond.in as any[]).includes(rowVal);
      throw new Error(`prismaFake: unsupported filter ${JSON.stringify(cond)}`);
    }
    const a = rowVal instanceof Date ? rowVal.getTime() : rowVal;
    const b = cond instanceof Date ? cond.getTime() : cond;
    return a === b;
  }

  function whereMatch(row: Row, where: Row): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (k === "portfolio") {
        // inventoryItem's relation filter: { portfolio: { userId } }
        const pf = db.portfolios.find((p) => p.id === row.portfolioId);
        if (!pf || !whereMatch(pf, v as Row)) return false;
        continue;
      }
      if (!matchValue(row[k], v)) return false;
    }
    return true;
  }

  function table(rows: Row[], idPrefix: string) {
    return {
      findFirst: async ({ where }: any) => rows.find((r) => whereMatch(r, where)) ?? null,
      findMany: async ({ where }: any) => rows.filter((r) => whereMatch(r, where)),
      create: async ({ data }: any) => {
        const row = { id: nextId(idPrefix), ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => whereMatch(r, where));
        if (!row) throw new Error("Record to update not found.");
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const hits = rows.filter((r) => whereMatch(r, where));
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
      deleteMany: async ({ where }: any) => {
        const keep = rows.filter((r) => !whereMatch(r, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      },
    };
  }

  const prismaFake = {
    tradeProposal: table(db.tradeProposals, "tp"),
    portfolio: table(db.portfolios, "pf"),
    inventoryItem: table(db.inventoryItems, "inv"),
    notificationLog: table(db.notificationLogs, "nl"),
    watchlistItem: {
      findUnique: async ({ where }: any) => {
        const k = where.userId_cardId;
        return db.watchlistItems.find((r) => r.userId === k.userId && r.cardId === k.cardId) ?? null;
      },
      delete: async ({ where }: any) => {
        const i = db.watchlistItems.findIndex((r) => r.id === where.id);
        if (i < 0) throw new Error("Record to delete not found.");
        return db.watchlistItems.splice(i, 1)[0];
      },
      upsert: async ({ where, create, update }: any) => {
        const k = where.userId_cardId;
        const row = db.watchlistItems.find((r) => r.userId === k.userId && r.cardId === k.cardId);
        if (row) {
          Object.assign(row, update);
          return row;
        }
        const created = { id: nextId("wl"), ...create };
        db.watchlistItems.push(created);
        return created;
      },
    },
    marketStat: {
      findUnique: async ({ where }: any) => db.marketStats.find((r) => r.cardId === where.cardId) ?? null,
    },
    userSettings: {
      findUnique: async ({ where }: any) => db.userSettings.find((r) => r.userId === where.userId) ?? null,
    },
    // Interactive transaction: hand the callback the same store. Atomicity is
    // provided by the conditional claim inside, which is what these tests pin.
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(prismaFake),
  };

  const resetDb = () => {
    for (const rows of Object.values(db)) rows.splice(0, rows.length);
  };

  return { db, prismaFake, resetDb };
});

vi.mock("@/lib/db", () => ({ prisma: prismaFake }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u1", email: "t@t.t", name: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { approveProposal, declineProposal, editProposalPrice, undoDecision } from "./proposals";
import { DEFAULT_FEE_PROFILES } from "@/lib/constants";
import { buyEdge, netProceeds } from "@/lib/fees";

function seedProposal(overrides: Row = {}): Row {
  const now = Date.now();
  const p: Row = {
    id: "tp-1",
    userId: "u1",
    cardId: "c1",
    side: "buy",
    quantity: 1,
    proposedPrice: 10,
    marketplace: "tcgplayer",
    netAfterFees: 8.5,
    costBasis: null,
    status: "pending",
    priceSnapshot: JSON.stringify({ price: 10 }),
    deepLink: "https://example.test/listing",
    executionMode: "deeplink",
    expiresAt: new Date(now + 60_000),
    decidedAt: null,
    executedAt: null,
    undoUntil: null,
    outcomePrice: null,
    outcomeNote: null,
    ...overrides,
  };
  db.tradeProposals.push(p);
  return p;
}

function seedHolding(overrides: Row = {}): Row {
  if (!db.portfolios.some((p) => p.id === "pf-1")) db.portfolios.push({ id: "pf-1", userId: "u1" });
  const row: Row = {
    id: `inv-seed-${db.inventoryItems.length + 1}`,
    portfolioId: "pf-1",
    cardId: "c1",
    quantity: 1,
    condition: "NM",
    costBasis: 5,
    status: "owned",
    acquiredAt: new Date(Date.now() - 86_400_000),
    location: null,
    tags: null,
    listedPrice: null,
    listedMarketplace: null,
    soldPrice: null,
    soldFees: null,
    soldAt: null,
    ...overrides,
  };
  db.inventoryItems.push(row);
  return row;
}

beforeEach(() => {
  resetDb();
});

describe("approveProposal claim", () => {
  it("applies a BUY's inventory effect exactly once across two sequential calls", async () => {
    seedProposal();
    const first = await approveProposal("tp-1");
    expect(first.ok).toBe(true);
    expect(first.deepLink).toBe("https://example.test/listing");
    expect(first.executionMode).toBe("deeplink");
    expect(typeof first.undoUntil).toBe("number");
    expect(db.inventoryItems).toHaveLength(1);

    const second = await approveProposal("tp-1");
    expect(second).toEqual({ ok: false, error: "Already approved" });
    expect(db.inventoryItems).toHaveLength(1); // no doubled BUY row
  });

  it("lets exactly one of two concurrent approvals win", async () => {
    seedProposal();
    const [a, b] = await Promise.all([approveProposal("tp-1"), approveProposal("tp-1")]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.error).toBe("Already approved");
    expect(db.inventoryItems).toHaveLength(1);
    expect(db.tradeProposals[0].status).toBe("approved");
    // The winner's undo record survives — the loser never overwrote it.
    expect(JSON.parse(db.tradeProposals[0].priceSnapshot)._inventoryEffect.kind).toBe("buy");
  });

  it("never consumes SELL holdings twice", async () => {
    seedProposal({ side: "sell", quantity: 2, proposedPrice: 10, netAfterFees: 17 });
    seedHolding({ quantity: 3 });

    const first = await approveProposal("tp-1");
    expect(first.ok).toBe(true);
    // Split: original row keeps 1, new sold row carries 2.
    expect(db.inventoryItems).toHaveLength(2);
    const sold = db.inventoryItems.filter((r) => r.status === "sold");
    expect(sold).toHaveLength(1);
    expect(sold[0].quantity).toBe(2);

    const second = await approveProposal("tp-1");
    expect(second).toEqual({ ok: false, error: "Already approved" });
    expect(db.inventoryItems).toHaveLength(2); // no second consumption
    expect(db.inventoryItems.filter((r) => r.status === "sold")).toHaveLength(1);
  });
});

describe("past-expiry guard", () => {
  it("refuses to approve a pending proposal whose expiresAt has passed, applying no effects", async () => {
    seedProposal({ expiresAt: new Date(Date.now() - 60_000) });
    const res = await approveProposal("tp-1");
    expect(res).toEqual({ ok: false, error: "Already expired" });
    expect(db.inventoryItems).toHaveLength(0); // no BUY row created
    // The row is untouched — the worker sweep owns the pending→expired flip.
    expect(db.tradeProposals[0].status).toBe("pending");
    expect(db.tradeProposals[0].decidedAt).toBeNull();
    expect(JSON.parse(db.tradeProposals[0].priceSnapshot)._inventoryEffect).toBeUndefined();
  });

  it("refuses to approve an expired SELL without consuming holdings", async () => {
    seedProposal({ side: "sell", quantity: 2, proposedPrice: 10, netAfterFees: 17, expiresAt: new Date(Date.now() - 1) });
    seedHolding({ quantity: 3 });
    const res = await approveProposal("tp-1");
    expect(res).toEqual({ ok: false, error: "Already expired" });
    expect(db.inventoryItems).toHaveLength(1);
    expect(db.inventoryItems[0].status).toBe("owned");
    expect(db.inventoryItems[0].quantity).toBe(3);
  });

  it("refuses to decline a pending proposal whose expiresAt has passed", async () => {
    seedProposal({ expiresAt: new Date(Date.now() - 60_000) });
    const res = await declineProposal("tp-1");
    expect(res).toEqual({ ok: false, error: "Already expired" });
    expect(db.tradeProposals[0].status).toBe("pending");
    expect(db.tradeProposals[0].undoUntil).toBeNull();
  });

  it("still approves and declines fresh proposals", async () => {
    seedProposal({ expiresAt: new Date(Date.now() + 60_000) });
    const approved = await approveProposal("tp-1");
    expect(approved.ok).toBe(true);
    expect(db.inventoryItems).toHaveLength(1);

    resetDb();
    seedProposal({ expiresAt: new Date(Date.now() + 60_000) });
    const declined = await declineProposal("tp-1");
    expect(declined.ok).toBe(true);
    expect(db.tradeProposals[0].status).toBe("declined");
  });
});

describe("declineProposal claim", () => {
  it("only the first decline wins; approve-then-decline reports the real status", async () => {
    seedProposal();
    const first = await declineProposal("tp-1");
    expect(first.ok).toBe(true);
    const second = await declineProposal("tp-1");
    expect(second).toEqual({ ok: false, error: "Already declined" });

    resetDb();
    seedProposal();
    await approveProposal("tp-1");
    const afterApprove = await declineProposal("tp-1");
    expect(afterApprove).toEqual({ ok: false, error: "Already approved" });
  });
});

describe("undoDecision claim", () => {
  it("reverses an approval once; a second undo gets 'Undo window elapsed'", async () => {
    seedProposal();
    await approveProposal("tp-1");
    expect(db.inventoryItems).toHaveLength(1);

    const first = await undoDecision("tp-1");
    expect(first.ok).toBe(true);
    expect(db.tradeProposals[0].status).toBe("pending");
    expect(db.tradeProposals[0].undoUntil).toBeNull();
    expect(db.inventoryItems).toHaveLength(0); // BUY row removed

    const second = await undoDecision("tp-1");
    expect(second).toEqual({ ok: false, error: "Undo window elapsed" });
  });

  it("lets exactly one of two concurrent undos win", async () => {
    seedProposal();
    await approveProposal("tp-1");
    const [a, b] = await Promise.all([undoDecision("tp-1"), undoDecision("tp-1")]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.error).toBe("Undo window elapsed");
    expect(db.tradeProposals[0].status).toBe("pending");
    expect(db.inventoryItems).toHaveLength(0);
  });
});

describe("editProposalPrice", () => {
  it("recomputes a pending SELL's netAfterFees with default tcgplayer fees", async () => {
    seedProposal({ side: "sell", quantity: 2, proposedPrice: 10, netAfterFees: 17 });
    const res = await editProposalPrice("tp-1", 12.5);
    expect(res).toEqual({ ok: true });
    expect(db.tradeProposals[0].proposedPrice).toBe(12.5);
    expect(db.tradeProposals[0].netAfterFees).toBe(netProceeds(12.5, 2, DEFAULT_FEE_PROFILES.tcgplayer).net);
    // Only price + net change — the row stays a live pending proposal.
    expect(db.tradeProposals[0].status).toBe("pending");
    expect(db.tradeProposals[0].decidedAt).toBeNull();
    expect(db.tradeProposals[0].undoUntil).toBeNull();
    expect(JSON.parse(db.tradeProposals[0].priceSnapshot)).toEqual({ price: 10 }); // evidence untouched
  });

  it("recomputes a pending BUY's edge against the marketStat median and honors fee overrides", async () => {
    seedProposal({ side: "buy", quantity: 2, proposedPrice: 10, netAfterFees: 8.5 });
    db.marketStats.push({ cardId: "c1", currentPrice: 11, median90d: 14 });
    const override = { feePct: 20, paymentFeePct: 0, shippingFlat: 1 };
    db.userSettings.push({ id: "us-1", userId: "u1", feeProfiles: JSON.stringify({ tcgplayer: override }) });

    const res = await editProposalPrice("tp-1", 9.25);
    expect(res).toEqual({ ok: true });
    expect(db.tradeProposals[0].proposedPrice).toBe(9.25);
    expect(db.tradeProposals[0].netAfterFees).toBe(
      buyEdge(9.25, 2, 14, "tcgplayer", { ...DEFAULT_FEE_PROFILES, tcgplayer: override }).net
    );
  });

  it("returns 'Already approved' and changes nothing on an approved proposal", async () => {
    seedProposal();
    await approveProposal("tp-1");
    const before = { ...db.tradeProposals[0] };
    const res = await editProposalPrice("tp-1", 25);
    expect(res).toEqual({ ok: false, error: "Already approved" });
    expect(db.tradeProposals[0].proposedPrice).toBe(before.proposedPrice);
    expect(db.tradeProposals[0].netAfterFees).toBe(before.netAfterFees);
    expect(db.tradeProposals[0].status).toBe("approved");
  });

  it("returns 'Already expired' past expiresAt without touching the row", async () => {
    seedProposal({ expiresAt: new Date(Date.now() - 60_000) });
    const res = await editProposalPrice("tp-1", 25);
    expect(res).toEqual({ ok: false, error: "Already expired" });
    expect(db.tradeProposals[0].proposedPrice).toBe(10);
    expect(db.tradeProposals[0].netAfterFees).toBe(8.5);
    // The row is untouched — the worker sweep owns the pending→expired flip.
    expect(db.tradeProposals[0].status).toBe("pending");
  });

  it("rejects NaN, zero, negative, and infinite prices server-side", async () => {
    seedProposal();
    for (const bad of [NaN, 0, -5, Infinity]) {
      const res = await editProposalPrice("tp-1", bad);
      expect(res).toEqual({ ok: false, error: "Price must be greater than $0" });
    }
    expect(db.tradeProposals[0].proposedPrice).toBe(10);
    expect(db.tradeProposals[0].netAfterFees).toBe(8.5);
  });
});
