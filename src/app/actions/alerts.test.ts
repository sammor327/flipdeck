// Write-boundary tests for updateRule: an edit must change what the form can
// express (name, trigger, params, action/side) and nothing else. The fields it
// must NOT touch are load-bearing — enabled/lastFiredAt carry the cooldown
// clock, scope/cardId keep card-scoped rules bound to their card, and the id
// itself keys 30-day attribution. Prisma is replaced with an in-memory
// stand-in — the contract under test is the merge/preserve logic, not SQLite.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { db, prismaFake, resetDb } = vi.hoisted(() => {
  const db = {
    alertRules: [] as Row[],
  };

  function whereMatch(row: Row, where: Row): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (row[k] !== v) return false;
    }
    return true;
  }

  const prismaFake = {
    alertRule: {
      findFirst: async ({ where }: any) => db.alertRules.find((r) => whereMatch(r, where)) ?? null,
      update: async ({ where, data }: any) => {
        const row = db.alertRules.find((r) => whereMatch(r, where));
        if (!row) throw new Error("Record to update not found.");
        Object.assign(row, data);
        return row;
      },
    },
  };

  const resetDb = () => {
    db.alertRules.splice(0, db.alertRules.length);
  };

  return { db, prismaFake, resetDb };
});

vi.mock("@/lib/db", () => ({ prisma: prismaFake }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u1", email: "t@t.t", name: "T" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { updateRule, type CreateRuleInput } from "./alerts";

function seedRule(overrides: Row = {}): Row {
  const row: Row = {
    id: `rule-${db.alertRules.length + 1}`,
    userId: "u1",
    name: "Dip alert",
    scope: "inventory",
    cardId: null,
    trigger: "threshold_below",
    params: JSON.stringify({ threshold: 40 }),
    action: "propose_trade",
    proposeSide: "sell",
    quantity: 1,
    marketplace: null,
    cooldownMinutes: 360,
    proposalExpiryMinutes: 30,
    quietHoursRespected: true,
    enabled: true,
    lastFiredAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
  db.alertRules.push(row);
  return row;
}

/** What the inline edit form sends: no scope knowledge (placeholder), no
 * quantity/marketplace/cooldown/expiry/quietHours fields. */
const editInput = (overrides: Partial<CreateRuleInput> = {}): CreateRuleInput => ({
  name: "Dip alert",
  scope: "inventory",
  trigger: "threshold_below",
  threshold: 40,
  movePct: 15,
  windowHours: 24,
  direction: "either",
  spreadPct: 8,
  lookbackDays: 90,
  action: "propose_trade",
  proposeSide: "sell",
  ...overrides,
});

beforeEach(() => {
  resetDb();
  vi.restoreAllMocks();
});

describe("updateRule", () => {
  it("persists new name, params, and side while keeping the rule's id", async () => {
    const row = seedRule();
    const res = await updateRule(row.id, editInput({ name: "Deeper dip", threshold: 25, proposeSide: "buy" }));
    expect(res).toEqual({ ok: true });
    expect(row.id).toBe("rule-1"); // same row mutated — attribution key intact
    expect(row.name).toBe("Deeper dip");
    expect(JSON.parse(row.params)).toEqual({ threshold: 25 });
    expect(row.proposeSide).toBe("buy");
  });

  it("rebuilds params on a trigger change so no stale keys survive", async () => {
    const row = seedRule();
    const res = await updateRule(row.id, editInput({ trigger: "pct_move", movePct: 20, windowHours: 48, direction: "down" }));
    expect(res).toEqual({ ok: true });
    expect(row.trigger).toBe("pct_move");
    // The old threshold key must not linger next to the pct_move params.
    expect(JSON.parse(row.params)).toEqual({ movePct: 20, windowHours: 48, direction: "down" });
  });

  it("preserves enabled, lastFiredAt, scope, and cardId across an edit", async () => {
    const firedAt = new Date("2026-07-01T12:00:00Z");
    const row = seedRule({ scope: "card", cardId: "c9", enabled: false, lastFiredAt: firedAt });
    // The form sends a placeholder scope; the stored card scope must win —
    // including revalidating cleanly even though the input carries no cardId.
    const res = await updateRule(row.id, editInput({ name: "Renamed", scope: "inventory" }));
    expect(res).toEqual({ ok: true });
    expect(row.name).toBe("Renamed");
    expect(row.scope).toBe("card");
    expect(row.cardId).toBe("c9");
    expect(row.enabled).toBe(false); // paused stays paused
    expect(row.lastFiredAt).toBe(firedAt); // cooldown clock untouched
  });

  it("keeps knob values the form doesn't send", async () => {
    const row = seedRule({
      quantity: 3,
      marketplace: "tcgplayer",
      cooldownMinutes: 120,
      proposalExpiryMinutes: 60,
      quietHoursRespected: false,
    });
    const res = await updateRule(row.id, editInput({ threshold: 33 }));
    expect(res).toEqual({ ok: true });
    expect(row.quantity).toBe(3);
    expect(row.marketplace).toBe("tcgplayer");
    expect(row.cooldownMinutes).toBe(120);
    expect(row.proposalExpiryMinutes).toBe(60);
    expect(row.quietHoursRespected).toBe(false);
  });

  it("rejects invalid input with the validator's message and persists nothing", async () => {
    const row = seedRule();
    const before = { ...row };

    const emptyName = await updateRule(row.id, editInput({ name: "   " }));
    expect(emptyName).toEqual({ ok: false, error: "Name required" });

    const badThreshold = await updateRule(row.id, editInput({ threshold: 0 }));
    expect(badThreshold).toEqual({ ok: false, error: "Threshold must be a positive number" });

    const nanMove = await updateRule(row.id, editInput({ trigger: "pct_move", movePct: NaN }));
    expect(nanMove).toEqual({ ok: false, error: "Move % must be a number" });

    expect(row).toEqual(before);
  });

  it("rejects another user's rule as not found and mutates nothing", async () => {
    const row = seedRule({ userId: "u2" });
    const before = { ...row };
    const res = await updateRule(row.id, editInput({ name: "Hijacked" }));
    expect(res).toEqual({ ok: false, error: "Not found" });
    expect(row).toEqual(before);
  });
});
