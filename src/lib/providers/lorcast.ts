// Disney Lorcana via Lorcast (community API). Coverage of Enchanted/foil
// printings is still maturing — VERIFY before relying on it; the adapter returns
// [] on any miss so the worker falls back to the mock. Docs: https://lorcast.com/docs/api
//
// Lorcast exposes prices under card.prices.usd / usd_foil on the card object.

import type { GameSlug } from "../constants";
import { num, safeFetchJson } from "./http";
import type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";

interface LorcastCard {
  prices?: { usd?: string | null; usd_foil?: string | null };
}

export class LorcastProvider implements PriceProvider {
  readonly id = "lorcast";
  supports(game: GameSlug): boolean {
    return game === "lorcana";
  }

  async fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]> {
    // Lorcast addresses cards as /v0/cards/<setCode>/<collectorNumber>.
    const url = `https://api.lorcast.com/v0/cards/${encodeURIComponent(card.setCode)}/${encodeURIComponent(
      card.collectorNumber
    )}`;
    const data = await safeFetchJson<LorcastCard>(url);
    if (!data?.prices) return [];
    const foil = card.finish !== "nonfoil";
    const usd = num(foil ? data.prices.usd_foil : data.prices.usd) ?? num(data.prices.usd);
    if (!usd) return [];
    return [{ marketplace: "tcgplayer", condition: "NM", priceType: "market", price: usd, currency: "USD", capturedAt: new Date() }];
  }
}

export const lorcastProvider = new LorcastProvider();
