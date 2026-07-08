import { describe, expect, it } from "vitest";
import { DEFAULT_FEE_PROFILES, type Marketplace } from "./constants";
import { bestSpread } from "./fees";
import { DAY_MS, HOUR_MS } from "./math";
import { computeMarketStat, SPREAD_FRESHNESS_MS, type StatPoint } from "./stats";

const NOW = new Date("2026-03-01T00:00:00Z");

/** A NM point captured `ageMs` before NOW. */
function pt(marketplace: Marketplace, price: number, ageMs: number, overrides: Partial<StatPoint> = {}): StatPoint {
  return {
    marketplace,
    condition: "NM",
    priceType: "market",
    price,
    currency: "USD",
    listingCount: null,
    capturedAt: new Date(NOW.getTime() - ageMs),
    ...overrides,
  };
}

describe("computeMarketStat spread freshness", () => {
  it("exports a 48h default freshness window", () => {
    expect(SPREAD_FRESHNESS_MS).toBe(48 * HOUR_MS);
  });

  it("two fresh marketplaces produce the same spread as an unfiltered bestSpread (pre-change behavior)", () => {
    const points = [pt("tcgplayer", 100, HOUR_MS), pt("ebay", 130, 2 * HOUR_MS)];
    const stat = computeMarketStat(points, { now: NOW })!;
    const expected = bestSpread(
      [
        { marketplace: "tcgplayer", price: 100, currency: "USD" },
        { marketplace: "ebay", price: 130, currency: "USD" },
      ],
      DEFAULT_FEE_PROFILES
    )!;
    expect(stat.bestSpreadPct).toBe(expected.netPct);
    expect(stat.bestSpreadBuy).toBe(expected.buyMarketplace);
    expect(stat.bestSpreadSell).toBe(expected.sellMarketplace);
    expect(stat.bestSpreadPct).not.toBeNull();
  });

  it("a stale marketplace is dropped from the spread while the primary series is untouched", () => {
    const points = [
      pt("tcgplayer", 100, 25 * HOUR_MS),
      pt("tcgplayer", 110, HOUR_MS),
      pt("cardmarket", 60, 5 * DAY_MS), // stale — would fabricate a huge spread
    ];
    const stat = computeMarketStat(points, { now: NOW })!;
    expect(stat.bestSpreadPct).toBeNull();
    expect(stat.bestSpreadBuy).toBeNull();
    expect(stat.bestSpreadSell).toBeNull();
    // Primary series (headline price + deltas) is unaffected by the filter.
    expect(stat.currentPrice).toBe(110);
    expect(stat.delta24hPct).toBeCloseTo(10);
  });

  it("honors an explicit maxQuoteAgeMs override in both directions", () => {
    const points = [pt("tcgplayer", 100, HOUR_MS), pt("cardmarket", 90, 5 * DAY_MS)];
    // Default 48h window drops the 5-day-old quote.
    expect(computeMarketStat(points, { now: NOW })!.bestSpreadPct).toBeNull();
    // Widened window re-admits it.
    const widened = computeMarketStat(points, { now: NOW, maxQuoteAgeMs: 7 * DAY_MS })!;
    expect(widened.bestSpreadPct).not.toBeNull();
    // Narrowed window drops even the hour-old pairing partner.
    const narrowed = computeMarketStat(points, { now: NOW, maxQuoteAgeMs: 30 * 60_000 })!;
    expect(narrowed.bestSpreadPct).toBeNull();
  });

  it("fresh sold-priceType quotes still participate in the spread", () => {
    const points = [pt("tcgplayer", 100, HOUR_MS), pt("ebay", 130, 3 * HOUR_MS, { priceType: "sold" })];
    const stat = computeMarketStat(points, { now: NOW })!;
    expect(stat.bestSpreadPct).not.toBeNull();
    expect(stat.bestSpreadBuy).toBe("tcgplayer");
    expect(stat.bestSpreadSell).toBe("ebay");
  });

  it("a single fresh marketplace keeps a null spread without crashing", () => {
    const stat = computeMarketStat([pt("tcgplayer", 100, HOUR_MS)], { now: NOW })!;
    expect(stat.currentPrice).toBe(100);
    expect(stat.bestSpreadPct).toBeNull();
    expect(stat.bestSpreadBuy).toBeNull();
    expect(stat.bestSpreadSell).toBeNull();
  });
});
