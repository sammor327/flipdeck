// fastLaneCardIds must union every enabled rule's resolved cards with every
// target-bearing watchlist item — the watch-target half is exactly what the
// old rules-only fast lane missed — dedupe overlaps, and scope both queries
// to a user when one is given (sidebar) while staying global when not (worker).

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { state } = vi.hoisted(() => ({
  state: {
    rules: [] as Row[],
    watchItems: [] as Row[],
    invItems: [] as Row[],
  },
}));

vi.mock("./db", () => ({
  prisma: {
    alertRule: {
      // Supports the shape fastLaneCardIds issues: { enabled: true } plus an
      // optional userId equality.
      findMany: async ({ where }: any) =>
        state.rules.filter((r) => r.enabled === where.enabled && (where.userId == null || r.userId === where.userId)),
    },
    watchlistItem: {
      // Two callers share this: watchlist-scoped rule resolution filters by
      // userId only; fastLaneCardIds adds the target-price OR.
      findMany: async ({ where }: any) =>
        state.watchItems.filter((w) => {
          if (where.userId != null && w.userId !== where.userId) return false;
          if (where.OR) {
            return where.OR.some((clause: Record<string, any>) =>
              Object.entries(clause).every(([field, cond]) =>
                cond !== null && typeof cond === "object" && "not" in cond ? w[field] !== cond.not : w[field] === cond
              )
            );
          }
          return true;
        }),
    },
    inventoryItem: {
      // Inventory-scoped rule resolution: portfolio-owner + status filter with
      // distinct cardIds.
      findMany: async ({ where }: any) => {
        const seen = new Set<string>();
        return state.invItems.filter((i) => {
          if (i.userId !== where.portfolio.userId) return false;
          if (!where.status.in.includes(i.status)) return false;
          if (seen.has(i.cardId)) return false;
          seen.add(i.cardId);
          return true;
        });
      },
    },
  },
}));

import { fastLaneCardIds } from "./fastLane";

function rule(userId: string, scope: string, cardId: string | null = null, enabled = true): Row {
  return { userId, scope, cardId, enabled };
}

function watchItem(userId: string, cardId: string, targets: { buy?: number; sell?: number } = {}): Row {
  return { userId, cardId, targetBuyPrice: targets.buy ?? null, targetSellPrice: targets.sell ?? null };
}

beforeEach(() => {
  state.rules = [];
  state.watchItems = [];
  state.invItems = [];
});

describe("fastLaneCardIds", () => {
  it("unions card-scoped rules, watchlist/inventory rule resolution, and target-bearing watch items", async () => {
    state.rules = [
      rule("u1", "card", "c-ruled"),
      rule("u2", "watchlist"),
      rule("u3", "inventory"),
    ];
    state.watchItems = [
      watchItem("u2", "c-watched"), // covered via u2's watchlist-scoped rule, no target
      watchItem("u4", "c-sell-target", { sell: 40 }), // no rule at all — the cycle-3 gap
    ];
    state.invItems = [
      { userId: "u3", cardId: "c-owned", status: "owned" },
      { userId: "u3", cardId: "c-owned", status: "listed" }, // distinct collapses the dupe
      { userId: "u3", cardId: "c-sold", status: "sold" }, // wrong status → excluded
    ];

    const ids = await fastLaneCardIds();
    expect(ids).toEqual(new Set(["c-ruled", "c-watched", "c-owned", "c-sell-target"]));
  });

  it("includes a card with a watch target and no enabled rule", async () => {
    state.watchItems = [watchItem("u1", "c1", { buy: 5 })];

    const ids = await fastLaneCardIds();
    expect(ids).toEqual(new Set(["c1"]));
  });

  it("counts a watch item with only a sell target", async () => {
    state.watchItems = [watchItem("u1", "c1", { sell: 25 })];

    expect(await fastLaneCardIds()).toEqual(new Set(["c1"]));
  });

  it("dedupes a card that is both ruled and targeted", async () => {
    state.rules = [rule("u1", "card", "c1")];
    state.watchItems = [watchItem("u1", "c1", { buy: 5 })];

    const ids = await fastLaneCardIds();
    expect(ids.size).toBe(1);
    expect(ids).toEqual(new Set(["c1"]));
  });

  it("returns an empty set with no enabled rules and no targets", async () => {
    state.rules = [rule("u1", "card", "c1", false)]; // disabled
    state.watchItems = [watchItem("u1", "c2")]; // watched, but no target

    expect((await fastLaneCardIds()).size).toBe(0);
  });

  it("ignores a card-scoped rule with a null cardId", async () => {
    state.rules = [rule("u1", "card", null)];

    expect((await fastLaneCardIds()).size).toBe(0);
  });

  it("applies the userId filter to both the rule and watch-target queries", async () => {
    state.rules = [rule("u1", "card", "c-u1-ruled"), rule("u2", "card", "c-u2-ruled")];
    state.watchItems = [watchItem("u1", "c-u1-target", { buy: 3 }), watchItem("u2", "c-u2-target", { sell: 9 })];

    expect(await fastLaneCardIds("u1")).toEqual(new Set(["c-u1-ruled", "c-u1-target"]));
    // No filter → the global set the worker ingests.
    expect(await fastLaneCardIds()).toEqual(new Set(["c-u1-ruled", "c-u1-target", "c-u2-ruled", "c-u2-target"]));
  });
});
