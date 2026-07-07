// Pokémon TCG via pokemontcg.io. TCGplayer prices (USD) live under
// data.tcgplayer.prices[<variant>]; Cardmarket (EUR) under data.cardmarket.prices.
// Works keyless at a lower rate limit; set POKEMONTCG_API_KEY to raise it.
// Docs: https://docs.pokemontcg.io/

import type { GameSlug } from "../constants";
import { num, safeFetchJson } from "./http";
import type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";

interface PokeResponse {
  data?: {
    tcgplayer?: { prices?: Record<string, { low?: number; mid?: number; market?: number; high?: number }> };
    cardmarket?: { prices?: { averageSellPrice?: number; trendPrice?: number; lowPrice?: number } };
  };
}

export class PokemonProvider implements PriceProvider {
  readonly id = "pokemontcg";
  supports(game: GameSlug): boolean {
    return game === "pokemon";
  }

  async fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]> {
    if (!card.pokemonTcgId) return [];
    const key = process.env.POKEMONTCG_API_KEY;
    const data = await safeFetchJson<PokeResponse>(
      `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(card.pokemonTcgId)}`,
      key ? { headers: { "X-Api-Key": key } } : {}
    );
    if (!data?.data) return [];
    const now = new Date();
    const out: ProviderQuote[] = [];

    const variants = data.data.tcgplayer?.prices ?? {};
    // Prefer holofoil, then the first available variant.
    const variant = variants.holofoil ?? variants.normal ?? Object.values(variants)[0];
    const market = num(variant?.market) ?? num(variant?.mid);
    const low = num(variant?.low);
    if (market) out.push({ marketplace: "tcgplayer", condition: "NM", priceType: "market", price: market, currency: "USD", capturedAt: now });
    if (low) out.push({ marketplace: "tcgplayer", condition: "NM", priceType: "low", price: low, currency: "USD", capturedAt: now });

    const cm = data.data.cardmarket?.prices;
    const cmPrice = num(cm?.trendPrice) ?? num(cm?.averageSellPrice);
    if (cmPrice) out.push({ marketplace: "cardmarket", condition: "NM", priceType: "market", price: cmPrice, currency: "EUR", capturedAt: now });
    return out;
  }
}

export const pokemonProvider = new PokemonProvider();
