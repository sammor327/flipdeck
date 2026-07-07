import { describe, expect, it } from "vitest";
import { evaluateRule, inCooldown, resolveSide } from "./evaluate";
import type { EvalContext, RuleLike } from "./types";

const NOW = new Date("2026-01-01T12:00:00Z");

function ctx(partial: Partial<EvalContext> = {}): EvalContext {
  return {
    now: NOW,
    currentPrice: 0,
    moveOverHours: () => null,
    lowestOverDays: () => null,
    bestSpreadPct: null,
    ...partial,
  };
}

function rule(partial: Partial<RuleLike> = {}): RuleLike {
  return {
    trigger: "threshold_above",
    params: {},
    proposeSide: "auto",
    cooldownMinutes: 360,
    lastFiredAt: null,
    enabled: true,
    ...partial,
  };
}

describe("threshold triggers", () => {
  it("fires threshold_above and proposes a sell", () => {
    const r = evaluateRule(
      rule({ trigger: "threshold_above", params: { threshold: 68 } }),
      ctx({ currentPrice: 71.5 })
    );
    expect(r.fired).toBe(true);
    expect(r.side).toBe("sell");
  });
  it("does not fire threshold_above below the threshold", () => {
    const r = evaluateRule(
      rule({ trigger: "threshold_above", params: { threshold: 80 } }),
      ctx({ currentPrice: 71.5 })
    );
    expect(r.fired).toBe(false);
  });
  it("fires threshold_below and proposes a buy", () => {
    const r = evaluateRule(
      rule({ trigger: "threshold_below", params: { threshold: 40 } }),
      ctx({ currentPrice: 38.2 })
    );
    expect(r.fired).toBe(true);
    expect(r.side).toBe("buy");
  });
});

describe("pct_move triggers (direction-aware)", () => {
  it("fires on an up move meeting the magnitude", () => {
    const r = evaluateRule(
      rule({ trigger: "pct_move", params: { windowHours: 24, movePct: 15, direction: "up" } }),
      ctx({ currentPrice: 71.5, moveOverHours: () => 18.4 })
    );
    expect(r.fired).toBe(true);
    expect(r.side).toBe("sell");
  });
  it("fires on a down move and proposes a buy", () => {
    const r = evaluateRule(
      rule({ trigger: "pct_move", params: { windowHours: 48, movePct: 15, direction: "down" } }),
      ctx({ currentPrice: 38.2, moveOverHours: () => -16.2 })
    );
    expect(r.fired).toBe(true);
    expect(r.side).toBe("buy");
  });
  it("does not fire when the move is in the wrong direction", () => {
    const r = evaluateRule(
      rule({ trigger: "pct_move", params: { windowHours: 24, movePct: 15, direction: "up" } }),
      ctx({ moveOverHours: () => -20 })
    );
    expect(r.fired).toBe(false);
  });
  it("does not fire when the magnitude is too small", () => {
    const r = evaluateRule(
      rule({ trigger: "pct_move", params: { windowHours: 24, movePct: 15, direction: "either" } }),
      ctx({ moveOverHours: () => 9 })
    );
    expect(r.fired).toBe(false);
  });
});

describe("spread + new_low triggers", () => {
  it("fires when the post-fee spread clears the threshold", () => {
    const r = evaluateRule(
      rule({ trigger: "spread", params: { spreadPct: 8 } }),
      ctx({ bestSpreadPct: 9.1 })
    );
    expect(r.fired).toBe(true);
    expect(r.side).toBe("buy");
  });
  it("fires on a new low and proposes a buy", () => {
    const r = evaluateRule(
      rule({ trigger: "new_low", params: { lookbackDays: 90 } }),
      ctx({ currentPrice: 38.2, lowestOverDays: () => 38.2 })
    );
    expect(r.fired).toBe(true);
    expect(r.side).toBe("buy");
  });
  it("does not fire when price is above the lookback low", () => {
    const r = evaluateRule(
      rule({ trigger: "new_low", params: { lookbackDays: 90 } }),
      ctx({ currentPrice: 41, lowestOverDays: () => 38.2 })
    );
    expect(r.fired).toBe(false);
  });
});

describe("cooldown suppression", () => {
  it("suppresses a met condition while cooling down", () => {
    const firedRecently = new Date(NOW.getTime() - 10 * 60000); // 10 min ago
    const r = evaluateRule(
      rule({ trigger: "threshold_above", params: { threshold: 68 }, cooldownMinutes: 360, lastFiredAt: firedRecently }),
      ctx({ currentPrice: 71.5 })
    );
    expect(r.fired).toBe(false);
    expect(r.suppressedByCooldown).toBe(true);
  });
  it("fires again once the cooldown has elapsed", () => {
    const firedLongAgo = new Date(NOW.getTime() - 400 * 60000); // 400 min ago
    const r = evaluateRule(
      rule({ trigger: "threshold_above", params: { threshold: 68 }, cooldownMinutes: 360, lastFiredAt: firedLongAgo }),
      ctx({ currentPrice: 71.5 })
    );
    expect(r.fired).toBe(true);
    expect(r.suppressedByCooldown).toBe(false);
  });
  it("inCooldown helper matches", () => {
    expect(inCooldown(rule({ cooldownMinutes: 60, lastFiredAt: new Date(NOW.getTime() - 30 * 60000) }), NOW)).toBe(true);
    expect(inCooldown(rule({ cooldownMinutes: 60, lastFiredAt: null }), NOW)).toBe(false);
  });
});

describe("resolveSide", () => {
  it("honors an explicit side and infers auto", () => {
    expect(resolveSide("buy", "threshold_above", "up")).toBe("buy");
    expect(resolveSide("auto", "threshold_above", "up")).toBe("sell");
    expect(resolveSide("auto", "new_low", "down")).toBe("buy");
    expect(resolveSide("auto", "pct_move", "down")).toBe("buy");
    expect(resolveSide("auto", "pct_move", "up")).toBe("sell");
  });
});

describe("disabled rules", () => {
  it("never fires when disabled", () => {
    const r = evaluateRule(
      rule({ trigger: "threshold_above", params: { threshold: 1 }, enabled: false }),
      ctx({ currentPrice: 100 })
    );
    expect(r.fired).toBe(false);
  });
});
