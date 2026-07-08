import { describe, expect, it } from "vitest";
import { validateRuleInput, type CreateRuleInput } from "./ruleValidation";

/** Minimal valid input; spread overrides on top. */
const base = (over: Partial<CreateRuleInput> = {}): CreateRuleInput => ({
  name: "Snap up dips",
  scope: "watchlist",
  trigger: "threshold_below",
  threshold: 12.5,
  ...over,
});

const expectError = (input: CreateRuleInput, pattern: RegExp) => {
  const r = validateRuleInput(input);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(pattern);
};

describe("validateRuleInput — rejects broken core semantics", () => {
  it("rejects an unknown marketplace, naming the bad value", () => {
    expectError(base({ marketplace: "cardkingdom" }), /marketplace "cardkingdom"/i);
  });
  it("rejects a card-scoped rule without a cardId", () => {
    expectError(base({ scope: "card" }), /pick a card/i);
    expectError(base({ scope: "card", cardId: "   " }), /pick a card/i);
  });
  it("rejects a missing threshold on threshold_below", () => {
    expectError(base({ threshold: undefined }), /threshold/i);
  });
  it("rejects a NaN threshold on threshold_below", () => {
    expectError(base({ threshold: NaN }), /threshold/i);
  });
  it("rejects zero/negative thresholds on threshold triggers", () => {
    expectError(base({ trigger: "threshold_above", threshold: 0 }), /threshold/i);
    expectError(base({ threshold: -3 }), /threshold/i);
  });
  it("rejects NaN/Infinity in any numeric field", () => {
    expectError(base({ quantity: NaN }), /quantity/i);
    expectError(base({ cooldownMinutes: Infinity }), /cooldown/i);
    expectError(base({ movePct: NaN }), /move %/i);
  });
  it("rejects an empty name and an unknown trigger", () => {
    expectError(base({ name: "   " }), /name/i);
    expectError(base({ trigger: "moon_phase" as CreateRuleInput["trigger"] }), /trigger "moon_phase"/i);
  });
  it("rejects out-of-range movePct and spreadPct", () => {
    expectError(base({ trigger: "pct_move", movePct: 750 }), /move %/i);
    expectError(base({ trigger: "spread", spreadPct: 120, threshold: undefined }), /spread %/i);
  });
});

describe("validateRuleInput — accepts and normalizes", () => {
  it("accepts marketplace 'tcgplayer'", () => {
    const r = validateRuleInput(base({ marketplace: "tcgplayer" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.marketplace).toBe("tcgplayer");
  });
  it("normalizes an empty marketplace to undefined", () => {
    const r = validateRuleInput(base({ marketplace: "  " }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.marketplace).toBeUndefined();
  });
  it("clamps quantity: 0 → 1 and 500 → 99", () => {
    const lo = validateRuleInput(base({ quantity: 0 }));
    const hi = validateRuleInput(base({ quantity: 500 }));
    expect(lo.ok && lo.value.quantity).toBe(1);
    expect(hi.ok && hi.value.quantity).toBe(99);
  });
  it("clamps cooldown to 5..10080 and proposal expiry to 5..1440", () => {
    const r = validateRuleInput(base({ cooldownMinutes: 1, proposalExpiryMinutes: 99999 }));
    expect(r.ok && r.value.cooldownMinutes).toBe(5);
    expect(r.ok && r.value.proposalExpiryMinutes).toBe(1440);
  });
  it("clamps windowHours to 1..720 and lookbackDays to 1..365", () => {
    const r = validateRuleInput(base({ trigger: "pct_move", threshold: undefined, movePct: 15, windowHours: 5000, lookbackDays: 0 }));
    expect(r.ok && r.value.windowHours).toBe(720);
    expect(r.ok && r.value.lookbackDays).toBe(1);
  });
  it("passes a valid full input through normalized (name trimmed, cardId kept)", () => {
    const r = validateRuleInput(
      base({
        name: "  Buy the dip  ",
        scope: "card",
        cardId: "card_123",
        marketplace: "cardmarket",
        action: "propose_trade",
        proposeSide: "buy",
        quantity: 4,
        cooldownMinutes: 60,
        proposalExpiryMinutes: 30,
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Buy the dip");
      expect(r.value.cardId).toBe("card_123");
      expect(r.value.quantity).toBe(4);
      expect(r.value.cooldownMinutes).toBe(60);
    }
  });
  it("caps an overlong name at 80 chars", () => {
    const r = validateRuleInput(base({ name: "x".repeat(200) }));
    expect(r.ok && r.value.name.length).toBe(80);
  });
  it("accepts a notify action with a spread trigger", () => {
    const r = validateRuleInput(
      base({ trigger: "spread", threshold: undefined, spreadPct: 8, action: "notify" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.action).toBe("notify");
  });
});
