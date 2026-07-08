import { describe, expect, it } from "vitest";
import { planSellConsumption } from "./actLoop";

describe("planSellConsumption", () => {
  it("consumes rows fully, oldest first, and apportions fees by quantity", () => {
    // gross = 100 × 3 = 300, net 270 → total fees 30, i.e. 10/unit
    const plan = planSellConsumption(
      [
        { id: "a", quantity: 2 },
        { id: "b", quantity: 1 },
      ],
      3,
      100,
      270
    );
    expect(plan.full).toEqual([
      { id: "a", quantity: 2, soldFees: 20 },
      { id: "b", quantity: 1, soldFees: 10 },
    ]);
    expect(plan.split).toBeNull();
    expect(plan.consumedQuantity).toBe(3);
    expect(plan.totalFees).toBe(30);
  });

  it("splits a partially consumed row (keep + new sold row)", () => {
    // gross = 10 × 2 = 20, net 18 → total fees 2
    const plan = planSellConsumption([{ id: "a", quantity: 5 }], 2, 10, 18);
    expect(plan.full).toEqual([]);
    expect(plan.split).toEqual({ id: "a", keepQuantity: 3, soldQuantity: 2, soldFees: 2 });
    expect(plan.consumedQuantity).toBe(2);
    expect(plan.totalFees).toBe(2);
  });

  it("mixes full rows with at most one trailing split", () => {
    // gross = 20 × 3 = 60, net 54 → total fees 6, i.e. 2/unit
    const plan = planSellConsumption(
      [
        { id: "a", quantity: 1 },
        { id: "b", quantity: 4 },
      ],
      3,
      20,
      54
    );
    expect(plan.full).toEqual([{ id: "a", quantity: 1, soldFees: 2 }]);
    expect(plan.split).toEqual({ id: "b", keepQuantity: 2, soldQuantity: 2, soldFees: 4 });
    expect(plan.consumedQuantity).toBe(3);
    expect(plan.totalFees).toBe(6);
  });

  it("selling more than owned consumes only what exists, fees pro-rated per unit", () => {
    // proposal fees = round2(100×5 − 450) = 50 → 10/unit, 2 units on hand
    const plan = planSellConsumption([{ id: "a", quantity: 2 }], 5, 100, 450);
    expect(plan.full).toEqual([{ id: "a", quantity: 2, soldFees: 20 }]);
    expect(plan.split).toBeNull();
    expect(plan.consumedQuantity).toBe(2);
    expect(plan.totalFees).toBe(20);
  });

  it("returns an empty plan for zero holdings or zero quantity", () => {
    const empty = { full: [], split: null, consumedQuantity: 0, totalFees: 0 };
    expect(planSellConsumption([], 3, 10, 27)).toEqual(empty);
    expect(planSellConsumption([{ id: "a", quantity: 2 }], 0, 10, 9)).toEqual(empty);
  });

  it("skips zero-quantity rows without consuming them", () => {
    const plan = planSellConsumption(
      [
        { id: "empty", quantity: 0 },
        { id: "a", quantity: 1 },
      ],
      1,
      10,
      9
    );
    expect(plan.full).toEqual([{ id: "a", quantity: 1, soldFees: 1 }]);
    expect(plan.consumedQuantity).toBe(1);
  });

  it("fee apportioning sums exactly to the total despite rounding", () => {
    // total fees = 1.00 across 3 single-copy rows → 0.33 + 0.34 + 0.33
    const plan = planSellConsumption(
      [
        { id: "a", quantity: 1 },
        { id: "b", quantity: 1 },
        { id: "c", quantity: 1 },
      ],
      3,
      10,
      29
    );
    expect(plan.full.map((op) => op.soldFees)).toEqual([0.33, 0.34, 0.33]);
    expect(plan.totalFees).toBe(1);
  });

  it("clamps fees at zero when net exceeds gross", () => {
    const plan = planSellConsumption([{ id: "a", quantity: 1 }], 1, 10, 12);
    expect(plan.full).toEqual([{ id: "a", quantity: 1, soldFees: 0 }]);
    expect(plan.totalFees).toBe(0);
  });
});
