import { describe, expect, it } from "vitest";
import { computeAnalytics, type FlipInput } from "./analytics";
import { DAY_MS } from "./math";

const T0 = new Date("2026-06-01T00:00:00Z").getTime();

/** A qualifying flip: sold `holdDays` after acquisition at T0 + offsetDays. */
function flip(overrides: Partial<FlipInput> = {}): FlipInput {
  return {
    soldPrice: 15,
    soldFees: 2,
    costBasis: 10,
    quantity: 1,
    acquiredAt: T0,
    soldAt: T0 + 10 * DAY_MS,
    cardName: "Ragavan, Nimble Pilferer",
    gameSlug: "mtg",
    gameName: "Magic",
    ...overrides,
  };
}

describe("computeAnalytics", () => {
  it("returns the zero/null shape for empty input", () => {
    const a = computeAnalytics([]);
    expect(a).toEqual({
      flips: 0,
      totalRealized: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      avgHoldDays: null,
      best: null,
      worst: null,
      byGame: [],
      series: [],
    });
  });

  it("handles a single winning flip (best === worst)", () => {
    // 1 × $15 − $2 fees − 1 × $10 cost = $3
    const a = computeAnalytics([flip()]);
    expect(a.flips).toBe(1);
    expect(a.totalRealized).toBe(3);
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(0);
    expect(a.winRate).toBe(100);
    expect(a.avgHoldDays).toBe(10);
    expect(a.best).toEqual({ cardName: "Ragavan, Nimble Pilferer", gameName: "Magic", realized: 3, holdDays: 10 });
    expect(a.worst).toEqual(a.best);
    expect(a.series).toEqual([{ t: T0 + 10 * DAY_MS, cum: 3 }]);
  });

  it("aggregates mixed wins and losses; series is cumulative in soldAt order", () => {
    const rows: FlipInput[] = [
      // deliberately out of soldAt order: loss (−$5) sold last, listed first
      flip({ soldPrice: 5, soldFees: null, soldAt: T0 + 30 * DAY_MS, cardName: "Loser" }),
      flip({ soldAt: T0 + 10 * DAY_MS, cardName: "Winner A" }), // +$3
      flip({ soldPrice: 20, soldFees: 0, quantity: 2, soldAt: T0 + 20 * DAY_MS, cardName: "Winner B" }), // +$20
    ];
    const a = computeAnalytics(rows);
    expect(a.flips).toBe(3);
    expect(a.totalRealized).toBe(18);
    expect(a.wins).toBe(2);
    expect(a.losses).toBe(1);
    expect(a.winRate).toBe(66.7);
    expect(a.avgHoldDays).toBe(20);
    expect(a.best?.cardName).toBe("Winner B");
    expect(a.worst?.cardName).toBe("Loser");
    expect(a.series).toEqual([
      { t: T0 + 10 * DAY_MS, cum: 3 },
      { t: T0 + 20 * DAY_MS, cum: 23 },
      { t: T0 + 30 * DAY_MS, cum: 18 },
    ]);
  });

  it("counts break-even flips as wins", () => {
    const a = computeAnalytics([flip({ soldPrice: 10, soldFees: 0 })]); // realized 0
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(0);
    expect(a.winRate).toBe(100);
  });

  it("excludes legacy rows with no recorded sale price", () => {
    const a = computeAnalytics([flip(), flip({ soldPrice: null, cardName: "Legacy" })]);
    expect(a.flips).toBe(1);
    expect(a.totalRealized).toBe(3);
    expect(a.series).toHaveLength(1);
    expect(a.byGame[0].flips).toBe(1);
  });

  it("excludes rows missing soldAt from every figure (documented scope choice)", () => {
    const a = computeAnalytics([flip(), flip({ soldAt: null, soldPrice: 100, cardName: "Undated" })]);
    expect(a.flips).toBe(1);
    expect(a.totalRealized).toBe(3); // the $90 undated win is not booked anywhere
    expect(a.avgHoldDays).toBe(10);
    expect(a.best?.cardName).toBe("Ragavan, Nimble Pilferer");
    expect(a.series).toHaveLength(1);
  });

  it("groups by game and sorts by realized desc", () => {
    const rows: FlipInput[] = [
      flip({ gameSlug: "mtg", gameName: "Magic" }), // +$3
      flip({ gameSlug: "mtg", gameName: "Magic", soldPrice: 5, soldFees: null }), // −$5
      flip({ gameSlug: "pokemon", gameName: "Pokémon", soldPrice: 30, soldFees: 1, cardName: "Charizard" }), // +$19
    ];
    const a = computeAnalytics(rows);
    expect(a.byGame).toEqual([
      { gameSlug: "pokemon", gameName: "Pokémon", flips: 1, realized: 19, winRate: 100 },
      { gameSlug: "mtg", gameName: "Magic", flips: 2, realized: -2, winRate: 50 },
    ]);
  });

  it("rounds avgHoldDays and highlight holdDays to 1dp", () => {
    const a = computeAnalytics([
      flip({ soldAt: T0 + Math.round(10.26 * DAY_MS) }),
      flip({ soldAt: T0 + Math.round(20.51 * DAY_MS) }),
    ]);
    expect(a.avgHoldDays).toBe(15.4); // (10.26 + 20.51) / 2 = 15.385 → 15.4
    expect(a.best?.holdDays).toBe(10.3);
  });
});
