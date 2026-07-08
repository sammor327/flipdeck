// Status-guard tests for the inventory write boundaries: sell/list/unlist and
// bulkList must claim the row with a conditional updateMany so a stale tab (or
// a slow refresh) can never re-sell a sold row (rewriting realized-P/L history)
// or flip a sold row back into active-portfolio math. Prisma is replaced with
// an in-memory stand-in — the atomicity under test is the conditional-claim
// pattern, not SQLite itself.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { db, prismaFake, resetDb } = vi.hoisted(() => {
  const db = {
    portfolios: [] as Row[],
    inventoryItems: [] as Row[],
    userSettings: [] as Row[],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}${++seq}`;

  function matchValue(rowVal: any, cond: any): boolean {
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
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
      findMany: async ({ where, select }: any) => {
        const hits = rows.filter((r) => whereMatch(r, where));
        if (select?.id) return hits.map((r) => ({ id: r.id }));
        return hits;
      },
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
    portfolio: table(db.portfolios, "pf"),
    inventoryItem: table(db.inventoryItems, "inv"),
    userSettings: {
      // Default fee profiles are fine for these tests; individual tests hook
      // this call to simulate a concurrent state change between the ownItem()
      // read and the conditional claim.
      findUnique: async ({ where }: any) => db.userSettings.find((r) => r.userId === where.userId) ?? null,
    },
  };

  const resetDb = () => {
    for (const rows of Object.values(db)) rows.splice(0, rows.length);
  };

  return { db, prismaFake, resetDb };
});

vi.mock("@/lib/db", () => ({ prisma: prismaFake }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u1", email: "t@t.t", name: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { bulkList, listInventoryItem, sellInventoryItem, unlistInventoryItem } from "./inventory";

function seedItem(overrides: Row = {}): Row {
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
    tags: "",
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

const soldRow = () =>
  seedItem({ status: "sold", soldPrice: 42, soldFees: 6.5, soldAt: new Date("2026-01-01T00:00:00Z") });

beforeEach(() => {
  resetDb();
  vi.restoreAllMocks();
});

describe("sellInventoryItem status guard", () => {
  it("sells an owned row and records sale fields", async () => {
    seedItem();
    const res = await sellInventoryItem("inv-seed-1", 20);
    expect(res.ok).toBe(true);
    expect((res as { net?: number }).net).toBeGreaterThan(0);
    const row = db.inventoryItems[0];
    expect(row.status).toBe("sold");
    expect(row.soldPrice).toBe(20);
    expect(row.soldFees).toBeGreaterThan(0);
    expect(row.soldAt).toBeInstanceOf(Date);
    expect(row.listedPrice).toBeNull();
  });

  it("returns 'Already sold' on a sold row and mutates nothing", async () => {
    const row = soldRow();
    const before = { ...row };
    const res = await sellInventoryItem(row.id, 99);
    expect(res).toEqual({ ok: false, error: "Already sold" });
    expect(row).toEqual(before); // soldPrice/soldFees/soldAt/status untouched
  });

  it("loses to a concurrent sale that lands between the read and the claim", async () => {
    const row = seedItem();
    // Simulate the other tab: the row flips to sold after ownItem() has read
    // it as owned but before this call's conditional claim runs.
    vi.spyOn(prismaFake.userSettings, "findUnique").mockImplementationOnce(async () => {
      Object.assign(row, { status: "sold", soldPrice: 42, soldFees: 6.5, soldAt: new Date("2026-01-01T00:00:00Z") });
      return null;
    });
    const res = await sellInventoryItem(row.id, 99);
    expect(res).toEqual({ ok: false, error: "Already sold" });
    expect(row.soldPrice).toBe(42); // the first sale's history survives
    expect(row.soldFees).toBe(6.5);
    expect(row.soldAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });
});

describe("listInventoryItem status guard", () => {
  it("lists an owned row", async () => {
    seedItem();
    const res = await listInventoryItem("inv-seed-1", 15);
    expect(res).toEqual({ ok: true });
    expect(db.inventoryItems[0].status).toBe("listed");
    expect(db.inventoryItems[0].listedPrice).toBe(15);
  });

  it("returns 'Already sold' on a sold row and never re-enters it into active math", async () => {
    const row = soldRow();
    const before = { ...row };
    const res = await listInventoryItem(row.id, 15);
    expect(res).toEqual({ ok: false, error: "Already sold" });
    expect(row).toEqual(before); // still sold, sale history intact
  });
});

describe("unlistInventoryItem status guard", () => {
  it("unlists a listed row", async () => {
    seedItem({ status: "listed", listedPrice: 15, listedMarketplace: "tcgplayer" });
    const res = await unlistInventoryItem("inv-seed-1");
    expect(res).toEqual({ ok: true });
    expect(db.inventoryItems[0].status).toBe("owned");
    expect(db.inventoryItems[0].listedPrice).toBeNull();
  });

  it("returns 'Not listed' on a sold row and does not resurrect it as owned", async () => {
    const row = soldRow();
    const before = { ...row };
    const res = await unlistInventoryItem(row.id);
    expect(res).toEqual({ ok: false, error: "Not listed" });
    expect(row).toEqual(before);
  });
});

describe("bulkList status guard", () => {
  it("skips sold rows and reports only the rows actually claimed", async () => {
    const owned = seedItem();
    const listed = seedItem({ status: "listed", listedPrice: 9, listedMarketplace: "tcgplayer" });
    const sold = soldRow();
    const res = await bulkList([owned.id, listed.id, sold.id], 25);
    expect(res).toEqual({ ok: true, count: 2 }); // not 3
    expect(owned.status).toBe("listed");
    expect(owned.listedPrice).toBe(25);
    expect(listed.listedPrice).toBe(25);
    expect(sold.status).toBe("sold"); // untouched
    expect(sold.soldPrice).toBe(42);
    expect(sold.listedPrice).toBeNull();
  });
});
