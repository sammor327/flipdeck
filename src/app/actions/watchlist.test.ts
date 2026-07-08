// addWatch must never clobber targets: its only UI caller (WatchButton) passes
// no targets, so re-watching an already-watched card (stale button state, a
// double-click racing removeWatch) has to leave targetBuyPrice/targetSellPrice/
// notes intact — those fields drive live worker proposals. Prisma is replaced
// with an in-memory stand-in following proposals.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { db, prismaFake, resetDb } = vi.hoisted(() => {
  const db = { watchlistItems: [] as Row[] };
  let seq = 0;

  const prismaFake = {
    watchlistItem: {
      upsert: async ({ where, create, update }: any) => {
        const k = where.userId_cardId;
        const row = db.watchlistItems.find((r) => r.userId === k.userId && r.cardId === k.cardId);
        if (row) {
          Object.assign(row, update);
          return row;
        }
        const created = { id: `wl${++seq}`, ...create };
        db.watchlistItems.push(created);
        return created;
      },
    },
  };

  const resetDb = () => db.watchlistItems.splice(0, db.watchlistItems.length);

  return { db, prismaFake, resetDb };
});

vi.mock("@/lib/db", () => ({ prisma: prismaFake }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u1", email: "t@t.t", name: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { addWatch } from "./watchlist";

beforeEach(() => {
  resetDb();
});

describe("addWatch", () => {
  it("re-watching with no targets leaves existing targets and notes intact", async () => {
    db.watchlistItems.push({ id: "wl-seed", userId: "u1", cardId: "c1", targetBuyPrice: 10, targetSellPrice: 25, notes: "grail" });
    const res = await addWatch("c1");
    expect(res).toEqual({ ok: true });
    expect(db.watchlistItems).toHaveLength(1);
    expect(db.watchlistItems[0]).toMatchObject({ targetBuyPrice: 10, targetSellPrice: 25, notes: "grail" });
  });

  it("only overwrites the fields explicitly provided on an existing watch", async () => {
    db.watchlistItems.push({ id: "wl-seed", userId: "u1", cardId: "c1", targetBuyPrice: 10, targetSellPrice: 25, notes: "grail" });
    const res = await addWatch("c1", 8);
    expect(res).toEqual({ ok: true });
    expect(db.watchlistItems[0]).toMatchObject({ targetBuyPrice: 8, targetSellPrice: 25, notes: "grail" });
  });

  it("creates a fresh watch without targets (all null)", async () => {
    const res = await addWatch("c2");
    expect(res).toEqual({ ok: true });
    expect(db.watchlistItems).toHaveLength(1);
    expect(db.watchlistItems[0]).toMatchObject({
      userId: "u1",
      cardId: "c2",
      targetBuyPrice: null,
      targetSellPrice: null,
      notes: null,
    });
  });

  it("creates a fresh watch with targets and notes", async () => {
    const res = await addWatch("c3", 5, 12, "flip candidate");
    expect(res).toEqual({ ok: true });
    expect(db.watchlistItems[0]).toMatchObject({
      userId: "u1",
      cardId: "c3",
      targetBuyPrice: 5,
      targetSellPrice: 12,
      notes: "flip candidate",
    });
  });
});
