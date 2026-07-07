// Magic: The Gathering via Scryfall (free). Scryfall bundles TCGplayer (usd) and
// Cardmarket (eur) prices per printing. It does not expose listing counts, so
// those are left null. Rate limit ~10 req/s — the worker batches + caches.
// EXECUTION MODE for MTG marketplaces is still deep-link; this adapter is data
// only. Docs: https://scryfall.com/docs/api/cards

import type { GameSlug } from "../constants";
import { num, safeFetchJson } from "./http";
import type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";

interface ScryfallCard {
  prices?: { usd?: string | null; usd_foil?: string | null; eur?: string | null; eur_foil?: string | null };
}

export class ScryfallProvider implements PriceProvider {
  readonly id = "scryfall";
  supports(game: GameSlug): boolean {
    return game === "mtg";
  }

  async fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]> {
    if (!card.scryfallId) return [];
    const data = await safeFetchJson<ScryfallCard>(`https://api.scryfall.com/cards/${card.scryfallId}`);
    if (!data?.prices) return [];
    const foil = card.finish !== "nonfoil";
    const usd = num(foil ? data.prices.usd_foil : data.prices.usd) ?? num(data.prices.usd);
    const eur = num(foil ? data.prices.eur_foil : data.prices.eur) ?? num(data.prices.eur);
    const now = new Date();
    const out: ProviderQuote[] = [];
    if (usd) out.push({ marketplace: "tcgplayer", condition: "NM", priceType: "market", price: usd, currency: "USD", capturedAt: now });
    if (eur) out.push({ marketplace: "cardmarket", condition: "NM", priceType: "market", price: eur, currency: "EUR", capturedAt: now });
    return out;
  }
}

export const scryfallProvider = new ScryfallProvider();
