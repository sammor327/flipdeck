// Mock price provider: realistic random-walk quotes so the whole app works with
// zero API keys. Given the previous observation it nudges price + listing count;
// with no history it synthesizes a plausible base from the card id. Each ingest
// tick appends one new PricePoint per (marketplace, condition).

import type { Condition } from "../constants";
import { CONDITIONS, marketplacesForGame, marketplaceById } from "../constants";
import { clamp, round2 } from "../math";
import { gaussian, seededRng } from "../rng";
import type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";

// Condition discounts relative to NM market price.
const CONDITION_FACTOR: Record<Condition, number> = {
  NM: 1,
  LP: 0.85,
  MP: 0.72,
  HP: 0.58,
  DM: 0.4,
};

function basePrice(card: ProviderCardRef): number {
  // Deterministic pseudo-price from the id so a fresh card still looks sane.
  const rng = seededRng(card.id + card.name);
  const tier = rng();
  // Long-tailed: most cards cheap, a few chase pieces.
  const p = tier > 0.9 ? 60 + rng() * 180 : tier > 0.65 ? 15 + rng() * 45 : 1 + rng() * 14;
  return round2(p);
}

export class MockPriceProvider implements PriceProvider {
  readonly id = "mock";
  supports(): boolean {
    return true;
  }

  async fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]> {
    const now = new Date();
    const markets = marketplacesForGame(card.gameSlug);
    const conditions: Condition[] = ["NM", "LP"]; // the mock tracks NM + LP depth
    const out: ProviderQuote[] = [];

    // Anchor NM/tcgplayer market price by walking from the previous point.
    const prevTcg = card.previous?.find(
      (q) => q.marketplace === "tcgplayer" && q.condition === "NM" && q.priceType === "market"
    );
    const rng = seededRng(card.id + now.getTime().toString());
    const anchor = prevTcg?.price ?? basePrice(card);
    // Daily drift ~0, vol ~3.5% per tick; occasional spike.
    const shock = rng() > 0.97 ? gaussian(rng) * 0.12 : 0;
    const step = gaussian(rng) * 0.035 + shock;
    const nmMarket = round2(clamp(anchor * (1 + step), 0.25, anchor * 3));

    for (const marketplace of markets) {
      const meta = marketplaceById(marketplace)!;
      // Cross-market offset: Cardmarket a touch cheaper, eBay a touch dearer.
      const offset = marketplace === "cardmarket" ? 0.94 : marketplace === "ebay" ? 1.02 : 1;
      const currency = meta.currency;
      const fx = currency === "EUR" ? 1 / 1.08 : 1; // store native currency

      if (marketplace === "ebay") {
        // eBay contributes sold comps (the truth), NM only.
        out.push({
          marketplace,
          condition: "NM",
          priceType: "sold",
          price: round2(nmMarket * offset * fx),
          currency,
          listingCount: Math.round(20 + rng() * 60),
          capturedAt: now,
        });
        continue;
      }

      for (const condition of conditions) {
        const factor = CONDITION_FACTOR[condition];
        const market = round2(nmMarket * offset * factor * fx);
        const low = round2(market * (0.9 + rng() * 0.05));
        const listings = Math.round(
          (condition === "NM" ? 40 : 12) + rng() * (card.gameSlug === "riftbound" ? 30 : 220)
        );
        out.push({ marketplace, condition, priceType: "market", price: market, currency, listingCount: listings, capturedAt: now });
        out.push({ marketplace, condition, priceType: "low", price: low, currency, listingCount: listings, capturedAt: now });
      }
    }
    return out;
  }
}

export const mockProvider = new MockPriceProvider();
