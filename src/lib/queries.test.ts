import { describe, expect, it } from "vitest";
import { summarize } from "./portfolio";
import { realizedPLFor } from "./queries";

describe("realizedPLFor", () => {
  it("computes net proceeds minus cost", () => {
    // 3 × $15 sale − $2 fees − 3 × $10 cost = $13
    expect(realizedPLFor(15, 2, 10, 3)).toBe(13);
  });

  it("treats missing fees as zero", () => {
    expect(realizedPLFor(5, null, 10, 1)).toBe(-5);
  });

  it("returns null for legacy sold rows with no recorded sale price", () => {
    expect(realizedPLFor(null, null, 10, 2)).toBeNull();
    expect(realizedPLFor(null, 2, 10, 2)).toBeNull();
  });

  it("rounds to cents", () => {
    expect(realizedPLFor(0.1, 0, 0.033, 3)).toBe(0.2);
  });

  it("matches summarize()'s realizedPL for the same sale", () => {
    const s = summarize([
      { cardId: "c1", quantity: 3, condition: "NM", costBasis: 10, status: "sold", nmMarketPrice: null, soldPrice: 15, soldFees: 2 },
    ]);
    expect(realizedPLFor(15, 2, 10, 3)).toBe(s.realizedPL);
  });
});
