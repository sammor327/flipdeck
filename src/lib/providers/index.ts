// Provider registry. Selects the data source per game from env flags, defaulting
// to the mock so the app works with zero keys. The real adapter is wrapped so
// that if it returns nothing (no key, miss, or outage) we transparently fall
// back to the mock random-walk — an ingest tick never comes back empty.

import type { GameSlug } from "../constants";
import { lorcastProvider } from "./lorcast";
import { mockProvider } from "./mock";
import { pokemonProvider } from "./pokemon";
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
  return withMockFallback(REAL[game]!);
}

export { mockProvider };
export type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";
