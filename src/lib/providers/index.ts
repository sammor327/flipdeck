// Provider registry. Selects the data source per game from env flags, defaulting
// to the mock so the app works with zero keys. The real adapter is wrapped so
// that every fetch first acquires a rate-limit token (real APIs ban hammering)
// and, if it returns nothing (no key, miss, outage, or token timeout), we
// transparently fall back to the mock random-walk — an ingest tick never comes
// back empty. The mock itself is never rate-limited.

import type { GameSlug } from "../constants";
import { lorcastProvider } from "./lorcast";
import { mockProvider } from "./mock";
import { pokemonProvider } from "./pokemon";
import { withRateLimit } from "./rateLimit";
import { scryfallProvider } from "./scryfall";
import type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";
import { ygoprodeckProvider } from "./ygoprodeck";

const ENV_KEY: Record<GameSlug, string> = {
  mtg: "PRICE_PROVIDER_MTG",
  pokemon: "PRICE_PROVIDER_POKEMON",
  yugioh: "PRICE_PROVIDER_YUGIOH",
  lorcana: "PRICE_PROVIDER_LORCANA",
  riftbound: "PRICE_PROVIDER_RIFTBOUND",
};

const REAL: Partial<Record<GameSlug, PriceProvider>> = {
  mtg: scryfallProvider,
  pokemon: pokemonProvider,
  yugioh: ygoprodeckProvider,
  lorcana: lorcastProvider,
  // riftbound: no reliable public API yet → mock only.
};

// Conservative requests-per-second budgets for each real API. Scryfall
// documents ~10 req/s; the others publish no hard limit, so stay well under
// anything that could look abusive. Buckets are keyed by provider.id (see
// withRateLimit), so the limit is per API, not per game.
const PROVIDER_RATE_LIMITS: Partial<Record<GameSlug, number>> = {
  mtg: 8, // scryfall
  pokemon: 2, // pokemontcg.io
  yugioh: 5, // ygoprodeck
  lorcana: 5, // lorcast
};
const DEFAULT_RATE_LIMIT = 2;

/** A provider that tries `real` and falls back to the mock on an empty result. */
function withMockFallback(real: PriceProvider): PriceProvider {
  return {
    id: `${real.id}+mock`,
    supports: () => true,
    async fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]> {
      const quotes = await real.fetchQuotes(card);
      if (quotes.length > 0) return quotes;
      return mockProvider.fetchQuotes(card);
    },
  };
}

export interface ProviderInfo {
  game: GameSlug;
  mode: string; // configured value, e.g. "scryfall" | "mock"
  providerId: string; // effective provider id
  isMock: boolean;
}

export function providerModeFor(game: GameSlug): ProviderInfo {
  const configured = (process.env[ENV_KEY[game]] || "mock").toLowerCase();
  const real = REAL[game];
  const useReal = real != null && configured !== "mock" && configured === real.id;
  return {
    game,
    mode: configured,
    providerId: useReal ? real!.id : "mock",
    isMock: !useReal,
  };
}

export function providerFor(game: GameSlug): PriceProvider {
  const info = providerModeFor(game);
  if (info.isMock) return mockProvider;
  return withMockFallback(withRateLimit(REAL[game]!, PROVIDER_RATE_LIMITS[game] ?? DEFAULT_RATE_LIMIT));
}

export { mockProvider };
export type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";
