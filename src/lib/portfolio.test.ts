import { describe, expect, it } from "vitest";
import { conditionMultiplier, normalizeCondition, type Condition } from "./constants";
import { priceForCondition, summarize, valueHolding, type HoldingInput } from "./portfolio";

describe("normalizeCondition", () => {
  it("accepts canonical codes", () => {
    expect(normalizeCondition("NM")).toBe("NM");
    expect(normalizeCondition("LP")).toBe("LP");
    expect(normalizeCondition("MP")).toBe("MP");
    expect(normalizeCondition("HP")).toBe("HP");
    expect(normalizeCondition("DM")).toBe("DM");
  });
  it("accepts display labels", () => {
    expect(normalizeCondition("Near Mint")).toBe("NM");
    expect(normalizeCondition("Lightly Played")).toBe("LP");
    expect(normalizeCondition("Moderately Played")).toBe("MP");
    expect(normalizeCondition("Heavily Played")).toBe("HP");
    expect(normalizeCondition("Damaged")).toBe("DM");
  });
  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeCondition("lp")).toBe("LP");
    expect(normalizeCondition(" HP ")).toBe("HP");
    expect(normalizeCondition("nEAR mINT")).toBe("NM");
  });
  it("accepts common aliases", () => {
    expect(normalizeCondition("Mint")).toBe("NM");
    expect(normalizeCondition("M")).toBe("NM");
    expect(normalizeCondition("DMG")).toBe("DM");
  });
  it("rejects unknown values", () => {
    expect(normalizeCondition("Sealed")).toBeNull();
    expect(normalizeCondition("")).toBeNull();
    expect(normalizeCondition("   ")).toBeNull();
    expect(normalizeCondition(null)).toBeNull();
    expect(normalizeCondition(undefined)).toBeNull();
  });
});

describe("conditionMultiplier", () => {
  it("returns the table multiplier for known codes", () => {
    expect(conditionMultiplier("NM")).toBe(1);
    expect(conditionMultiplier("LP")).toBe(0.85);
    expect(conditionMultiplier("DM")).toBe(0.4);
  });
  it("falls back to the NM multiplier for unknown strings", () => {
    expect(conditionMultiplier("Near Mint")).toBe(1);
    expect(conditionMultiplier("garbage")).toBe(1);
    expect(conditionMultiplier("")).toBe(1);
  });
});

describe("valuation with a bogus persisted condition", () => {
  // A legacy row whose condition column holds a label instead of a code.
  const bogus = "Near Mint" as Condition;
  const holding: HoldingInput = {
    cardId: "c1",
    quantity: 3,
    condition: bogus,
    costBasis: 10,
    status: "owned",
    nmMarketPrice: 20,
  };

  it("priceForCondition stays finite (NM fallback)", () => {
    expect(priceForCondition(20, bogus)).toBe(20);
    expect(priceForCondition(null, bogus)).toBeNull();
  });

  it("valueHolding returns finite numbers", () => {
    const v = valueHolding(holding);
    expect(Number.isFinite(v.marketValue)).toBe(true);
    expect(Number.isFinite(v.costTotal)).toBe(true);
    expect(Number.isFinite(v.unrealizedPL)).toBe(true);
    expect(v.marketValue).toBe(60);
    expect(v.unrealizedPL).toBe(30);
  });

  it("summarize returns finite numbers across mixed holdings", () => {
    const s = summarize([
      holding,
      { ...holding, cardId: "c2", condition: "LP", status: "listed" },
      { ...holding, cardId: "c3", status: "sold", soldPrice: 15, soldFees: 2 },
    ]);
    expect(Number.isFinite(s.marketValue)).toBe(true);
    expect(Number.isFinite(s.costBasis)).toBe(true);
    expect(Number.isFinite(s.unrealizedPL)).toBe(true);
    expect(Number.isFinite(s.listedValue)).toBe(true);
    expect(Number.isFinite(s.realizedPL)).toBe(true);
    expect(s.unrealizedPct == null || Number.isFinite(s.unrealizedPct)).toBe(true);
  });
});
