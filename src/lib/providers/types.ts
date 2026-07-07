import type { Condition, GameSlug, Marketplace } from "../constants";

export interface ProviderQuote {
  marketplace: Marketplace;
  condition: Condition;
  priceType: "market" | "low" | "sold";
  price: number;
  currency: string;
  listingCount?: number | null;
  capturedAt?: Date;
}

/** Just enough of a Card to fetch a quote. `previous` lets stateless providers
 * (the mock) random-walk from the last observation. */
export interface ProviderCardRef {
  id: string;
  gameSlug: GameSlug;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  finish: string;
  scryfallId?: string | null;
  tcgplayerId?: string | null;
  cardmarketId?: string | null;
  pokemonTcgId?: string | null;
  ygoprodeckId?: string | null;
  previous?: ProviderQuote[];
}

export interface PriceProvider {
  /** Stable id, e.g. "mock" | "scryfall" | "ygoprodeck". */
  readonly id: string;
  supports(game: GameSlug): boolean;
  /**
   * Return current quotes for a card. Implementations MUST NOT throw — return
   * an empty array on any failure so the worker can fall back to the mock.
   */
  fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]>;
}
