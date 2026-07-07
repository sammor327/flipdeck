import { describe, expect, it } from "vitest";
import type { FeeProfile, Marketplace } from "./constants";
import { bestSpread, buyEdge, computeSpread, netProceeds, toUsd, type MarketQuote } from "./fees";

const zeroFee: FeeProfile = { feePct: 0, paymentFeePct: 0, shippingFlat: 0 };
const tenPct: FeeProfile = { feePct: 10, paymentFeePct: 0, shippingFlat: 0 };

describe("netProceeds", () => {
  it("applies commission to gross", () => {
    const r = netProceeds(100, 2, tenPct);
    expect(r.gross).toBe(200);
    expect(r.feeAmount).toBe(20);
    expect(r.net).toBe(180);
    expect(r.netPerUnit).toBe(90);
    expect(r.effectiveFeePct).toBe(10);
  });
  it("includes payment fee and per-order shipping", () => {
    const r = netProceeds(100, 1, { feePct: 10, paymentFeePct: 2.5, shippingFlat: 1 });
    expect(r.feeAmount).toBe(12.5);
    expect(r.shipping).toBe(1);
    expect(r.net).toBe(86.5);
    expect(r.effectiveFeePct).toBe(13.5);
  });
});

describe("toUsd", () => {
  it("normalizes EUR into USD and passes USD through", () => {
    expect(toUsd(100, "EUR")).toBe(108);
    expect(toUsd(100, "USD")).toBe(100);
  });
});

describe("computeSpread", () => {
  it("nets a buy-here/sell-there spread after the sell-side fee", () => {
    const s = computeSpread(
      { marketplace: "cardmarket", price: 60, currency: "USD" },
      { marketplace: "tcgplayer", price: 70, currency: "USD" },
      { tcgplayer: tenPct }
    );
    expect(s.sellPrice).toBe(70);
    expect(s.netPerCopy).toBe(3); // 70*0.9 - 60
    expect(s.netPct).toBe(5); // 3 / 60
  });
});

describe("bestSpread", () => {
  it("finds the best distinct-marketplace pair", () => {
    const quotes: MarketQuote[] = [
      { marketplace: "tcgplayer", price: 70, currency: "USD" },
      { marketplace: "cardmarket", price: 60, currency: "USD" },
      { marketplace: "ebay", price: 80, currency: "USD" },
    ];
    const overrides: Partial<Record<Marketplace, FeeProfile>> = {
      tcgplayer: zeroFee,
      cardmarket: zeroFee,
      ebay: zeroFee,
    };
    const best = bestSpread(quotes, overrides)!;
    expect(best.buyMarketplace).toBe("cardmarket");
    expect(best.sellMarketplace).toBe("ebay");
    expect(best.netPerCopy).toBe(20);
    expect(best.netPct).toBeCloseTo(33.33, 1);
  });
  it("returns null with fewer than two markets", () => {
    expect(bestSpread([{ marketplace: "tcgplayer", price: 10, currency: "USD" }])).toBeNull();
  });
});

describe("buyEdge", () => {
  it("estimates net edge on a buy given an expected resale", () => {
    const e = buyEdge(50, 2, 70, "tcgplayer", { tcgplayer: tenPct });
    expect(e.net).toBe(26); // 70*2*0.9 - 100
    expect(e.pct).toBe(26);
  });
});
