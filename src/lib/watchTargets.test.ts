import { describe, expect, it } from "vitest";
import { evaluateWatchTarget } from "./watchTargets";

const targets = (buy: number | null, sell: number | null) => ({
  targetBuyPrice: buy,
  targetSellPrice: sell,
});

describe("evaluateWatchTarget", () => {
  it("fires a buy when the price drops below the buy target", () => {
    const hit = evaluateWatchTarget(targets(10, null), 8, false);
    expect(hit?.side).toBe("buy");
    expect(hit?.reason).toBe("Watch target — hit your buy target $10.00 (now $8.00)");
  });

  it("fires a buy at exactly the buy target (equality boundary)", () => {
    expect(evaluateWatchTarget(targets(10, null), 10, false)?.side).toBe("buy");
  });

  it("does not fire a buy while the price sits above the target", () => {
    expect(evaluateWatchTarget(targets(10, null), 10.01, false)).toBeNull();
  });

  it("fires a sell when the price rises above the sell target and the user holds copies", () => {
    const hit = evaluateWatchTarget(targets(null, 20), 25, true);
    expect(hit?.side).toBe("sell");
    expect(hit?.reason).toBe("Watch target — hit your sell target $20.00 (now $25.00)");
  });

  it("fires a sell at exactly the sell target (equality boundary)", () => {
    expect(evaluateWatchTarget(targets(null, 20), 20, true)?.side).toBe("sell");
  });

  it("does not fire a sell while the price sits below the target", () => {
    expect(evaluateWatchTarget(targets(null, 20), 19.99, true)).toBeNull();
  });

  it("skips a sell with zero holdings — proposing a sell you can't fill is meaningless", () => {
    expect(evaluateWatchTarget(targets(null, 20), 25, false)).toBeNull();
  });

  it("prefers the buy when both targets are crossed (misconfigured)", () => {
    // Buy target above the sell target: price 15 satisfies both. Buy wins.
    expect(evaluateWatchTarget(targets(20, 10), 15, true)?.side).toBe("buy");
  });

  it("returns null when no targets are set", () => {
    expect(evaluateWatchTarget(targets(null, null), 5, true)).toBeNull();
  });
});
