// Yu-Gi-Oh! via YGOPRODeck (free). Returns TCGplayer / eBay average prices in
// USD and the Cardmarket average in EUR (normalized to USD downstream via
// toUsd). No listing counts. Please cache aggressively and attribute per their
// terms. Docs: https://ygoprodeck.com/api-guide/

import type { GameSlug } from "../constants";
import { num, safeFetchJson } from "./http";
import type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";

interface YgoResponse {
  data?: Array<{
    card_prices?: Array<{
      tcgplayer_price?: string;
      cardmarket_price?: string;
      ebay_price?: string;
    }>;
  }>;
}

export class YgoprodeckProvider implements PriceProvider {
  readonly id = "ygoprodeck";
  supports(game: GameSlug): boolean {
    return game === "yugioh";
  }

  async fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]> {
    const q = card.ygoprodeckId
      ? `id=${encodeURIComponent(card.ygoprodeckId)}`
      : `name=${encodeURIComponent(card.name)}`;
    const data = await safeFetchJson<YgoResponse>(`https://db.ygoprodeck.com/api/v7/cardinfo.php?${q}`);
    const prices = data?.data?.[0]?.card_prices?.[0];
    if (!prices) return [];
    const now = new Date();
    const out: ProviderQuote[] = [];
    const tcg = num(prices.tcgplayer_price);
    const cm = num(prices.cardmarket_price);
    const eb = num(prices.ebay_price);
    if (tcg) out.push({ marketplace: "tcgplayer", condition: "NM", priceType: "market", price: tcg, currency: "USD", capturedAt: now });
    if (cm) out.push({ marketplace: "cardmarket", condition: "NM", priceType: "market", price: cm, currency: "EUR", capturedAt: now });
    if (eb) out.push({ marketplace: "ebay", condition: "NM", priceType: "sold", price: eb, currency: "USD", capturedAt: now });
    return out;
  }
}

export const ygoprodeckProvider = new YgoprodeckProvider();
