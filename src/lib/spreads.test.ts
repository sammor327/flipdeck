import { describe, expect, it } from "vitest";
import { DEFAULT_FEE_PROFILES, type FeeProfile, type Marketplace } from "./constants";
import { mergeFeeProfiles } from "./feeProfiles";
import { bestSpread, toUsd } from "./fees";
import { DAY_MS, HOUR_MS } from "./math";
import { userBestSpreads, type SpreadQuotePoint } from "./spreads";

const NOW = new Date("2026-03-01T00:00:00Z");

/** An NM market quote for `cardId` captured `ageMs` before NOW. */
function pt(cardId: string, marketplace: Marketplace, price: number, ageMs: number, overrides: Partial<SpreadQuotePoint> = {}): SpreadQuotePoint {
  return {
    cardId,
    marketplace,
    price,
    currency: "USD",
    priceType: "market",
    capturedAt: new Date(NOW.getTime() - ageMs),
    ...overrides,
  };
}

describe("userBestSpreads", () => {
  it("returns an empty map for empty input", () => {
    expect(userBestSpreads([], DEFAULT_FEE_PROFILES, { now: NOW }).size).toBe(0);
  });

  it("a fee-profile override flips the winning route and net vs the defaults", () => {
    const points = [
      pt("c1", "tcgplayer", 100, HOUR_MS),
      pt("c1", "ebay", 120, 2 * HOUR_MS),
      pt("c1", "cardmarket", 100, 3 * HOUR_MS, { currency: "EUR" }),
    ];
    const withDefaults = userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW }).get("c1")!;
    // Default eBay fees (13.25%): buy TCGplayer $100 → sell eBay $120 nets 4.1%.
    expect(withDefaults.buyMarketplace).toBe("tcgplayer");
    expect(withDefaults.sellMarketplace).toBe("ebay");
    expect(withDefaults.netPct).toBeCloseTo(4.1);

    // This seller's real eBay costs (higher fees + flat shipping) kill the
    // eBay route entirely; the best spread reroutes to Cardmarket at 2.6%.
    const tuned: Record<Marketplace, FeeProfile> = {
      ...DEFAULT_FEE_PROFILES,
      ebay: { feePct: 20, paymentFeePct: 3, shippingFlat: 4 },
    };
    const withOverride = userBestSpreads(points, tuned, { now: NOW }).get("c1")!;
    expect(withOverride.sellMarketplace).toBe("cardmarket");
    expect(withOverride.netPct).toBeCloseTo(2.6);
    expect(withOverride.netPct).not.toBe(withDefaults.netPct);
  });

  it("quotes older than the freshness window are excluded", () => {
    const points = [
      pt("c1", "tcgplayer", 100, HOUR_MS),
      pt("c1", "cardmarket", 60, 5 * DAY_MS, { currency: "EUR" }), // stale — would fabricate a huge spread
    ];
    // Default 48h window drops the 5-day-old quote → single marketplace → no spread.
    expect(userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW }).has("c1")).toBe(false);
    // An explicit widened window re-admits it.
    expect(userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW, maxQuoteAgeMs: 7 * DAY_MS }).has("c1")).toBe(true);
  });

  it("uses the latest fresh quote per marketplace", () => {
    const points = [
      pt("c1", "tcgplayer", 50, 40 * HOUR_MS), // fresh but superseded
      pt("c1", "tcgplayer", 100, HOUR_MS),
      pt("c1", "ebay", 130, 2 * HOUR_MS),
    ];
    const expected = bestSpread(
      [
        { marketplace: "tcgplayer", price: 100, currency: "USD" },
        { marketplace: "ebay", price: 130, currency: "USD" },
      ],
      DEFAULT_FEE_PROFILES
    )!;
    const got = userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW }).get("c1")!;
    expect(got.netPct).toBe(expected.netPct);
    expect(got.buyMarketplace).toBe("tcgplayer");
    expect(got.sellMarketplace).toBe("ebay");
    // Leg prices ride along so a spread-rule fire can propose the actual arb.
    expect(got.buyPrice).toBe(100);
    expect(got.sellPrice).toBe(130);
  });

  it("converts non-USD quotes to USD (EUR Cardmarket)", () => {
    const points = [pt("c1", "tcgplayer", 100, HOUR_MS), pt("c1", "cardmarket", 100, HOUR_MS, { currency: "EUR" })];
    const got = userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW }).get("c1")!;
    // €100 → $108; sell on Cardmarket at 5% nets $102.60 against a $100 buy.
    expect(got.buyMarketplace).toBe("tcgplayer");
    expect(got.sellMarketplace).toBe("cardmarket");
    expect(got.netPerCopy).toBeCloseTo(toUsd(100, "EUR") * 0.95 - 100);
    expect(got.netPct).toBeCloseTo(2.6);
    // Leg prices are USD-normalized, not the native EUR quote.
    expect(got.buyPrice).toBe(100);
    expect(got.sellPrice).toBe(toUsd(100, "EUR"));
  });

  it("a card with only one fresh marketplace yields no spread", () => {
    const points = [pt("c1", "tcgplayer", 100, HOUR_MS), pt("c1", "tcgplayer", 101, 2 * HOUR_MS)];
    expect(userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW }).has("c1")).toBe(false);
  });

  it("low-priceType asks never participate", () => {
    const points = [pt("c1", "tcgplayer", 100, HOUR_MS), pt("c1", "ebay", 130, HOUR_MS, { priceType: "low" })];
    expect(userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW }).has("c1")).toBe(false);
  });

  it("handles many cards independently; sold quotes participate", () => {
    const points = [
      pt("c1", "tcgplayer", 100, HOUR_MS),
      pt("c1", "ebay", 130, HOUR_MS, { priceType: "sold" }),
      pt("c2", "tcgplayer", 20, HOUR_MS), // single marketplace → absent
    ];
    const map = userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW });
    expect(map.size).toBe(1);
    expect(map.get("c1")!.sellMarketplace).toBe("ebay");
  });

  it("a user with no settings row (mergeFeeProfiles(undefined)) matches the defaults", () => {
    const points = [pt("c1", "tcgplayer", 100, HOUR_MS), pt("c1", "ebay", 120, HOUR_MS)];
    expect(userBestSpreads(points, mergeFeeProfiles(undefined), { now: NOW })).toEqual(
      userBestSpreads(points, DEFAULT_FEE_PROFILES, { now: NOW })
    );
  });
});
