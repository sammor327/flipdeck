import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  computeDeltas,
  dailyReturns,
  estimateSalesPerDay,
  grossSpreadPct,
  liquidityScore,
  median,
  minOver,
  moveOverWindow,
  pctChange,
  priceAsOf,
  stddev,
  toDailyCloses,
  volatilityPct,
  type PricePointLite,
} from "./math";

const BASE = new Date("2026-01-01T00:00:00Z").getTime();
function dailySeries(prices: number[]): PricePointLite[] {
  return prices.map((price, i) => ({ price, capturedAt: new Date(BASE + i * DAY_MS) }));
}

describe("pctChange", () => {
  it("computes signed percentage change", () => {
    expect(pctChange(100, 110)).toBeCloseTo(10);
    expect(pctChange(100, 90)).toBeCloseTo(-10);
  });
  it("guards against a non-positive base", () => {
    expect(pctChange(0, 10)).toBeNull();
    expect(pctChange(-5, 10)).toBeNull();
  });
});

describe("priceAsOf", () => {
  const series = dailySeries([100, 101, 102, 103]);
  it("returns the most recent price at or before t", () => {
    expect(priceAsOf(series, new Date(BASE + 2 * DAY_MS))).toBe(102);
    expect(priceAsOf(series, new Date(BASE + 2 * DAY_MS + 3600_000))).toBe(102);
  });
  it("falls back to the earliest price before the series", () => {
    expect(priceAsOf(series, new Date(BASE - DAY_MS))).toBe(100);
  });
});

describe("moveOverWindow / computeDeltas", () => {
  const series = dailySeries([100, 101, 102, 103, 104, 105, 106, 107]); // day 0..7

  it("computes a 24h move from the day-before price", () => {
    expect(moveOverWindow(series, DAY_MS)).toBeCloseTo(pctChange(106, 107)!);
  });
  it("computes a 7d move across the window", () => {
    expect(moveOverWindow(series, 7 * DAY_MS)).toBeCloseTo(7);
  });
  it("rolls the three UI windows up", () => {
    const d = computeDeltas(series);
    expect(d.delta7dPct).toBeCloseTo(7);
    // 30d window predates the series → falls back to earliest (100 → 107).
    expect(d.delta30dPct).toBeCloseTo(7);
  });
});

describe("daily closes + volatility", () => {
  it("collapses to one close per day", () => {
    const closes = toDailyCloses(dailySeries([10, 11, 12]));
    expect(closes).toEqual([10, 11, 12]);
  });
  it("computes returns and stdev", () => {
    expect(dailyReturns([100, 110, 121])).toEqual([0.1, 0.1]);
    expect(stddev([1, 1, 1])).toBe(0);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
  it("a flat series has zero volatility", () => {
    expect(volatilityPct(dailySeries([50, 50, 50, 50]))).toBe(0);
  });
});

describe("min / median / spread / liquidity", () => {
  it("finds the min over a lookback window", () => {
    const series = dailySeries([100, 90, 95, 88, 92]); // 5 days
    expect(minOver(series, 3)).toBe(88);
  });
  it("computes median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("computes gross spread %", () => {
    expect(grossSpreadPct(100, 110)).toBeCloseTo(10);
  });
  it("scores liquidity deterministically in 0..100", () => {
    expect(liquidityScore(0, 0)).toBe(0);
    expect(liquidityScore(1000, 15)).toBe(100);
    expect(liquidityScore(100, 0)).toBe(33);
    const s = liquidityScore(214, 9);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("estimateSalesPerDay", () => {
  it("counts listing-count drops as sales", () => {
    const series: PricePointLite[] = [
      { price: 10, capturedAt: new Date(BASE), listingCount: 100 },
      { price: 10, capturedAt: new Date(BASE + DAY_MS), listingCount: 90 }, // -10
      { price: 10, capturedAt: new Date(BASE + 2 * DAY_MS), listingCount: 95 }, // +5 ignored
      { price: 10, capturedAt: new Date(BASE + 3 * DAY_MS), listingCount: 80 }, // -15
    ];
    // 25 sold over 3 days ≈ 8.33/day
    expect(estimateSalesPerDay(series, 7)).toBeCloseTo(25 / 3, 2);
  });
  it("returns 0 without listing data", () => {
    expect(estimateSalesPerDay(dailySeries([1, 2, 3]))).toBe(0);
  });
});
