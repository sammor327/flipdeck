// Per-user cross-market spread, derived at read time. The worker caches
// MarketStat.bestSpread* with DEFAULT_FEE_PROFILES; list surfaces (spread
// scanner, Top Movers, /movers) re-derive the spread from fresh NM quotes with
// the viewer's merged fee profiles instead — the same latest-fresh-quote-per-
// marketplace logic the card detail page uses — so tuned Settings profiles are
// honored everywhere. Pure given the rows; the Prisma loader lives in queries.ts.

import type { FeeProfile, Marketplace } from "./constants";
import { bestSpread, type MarketQuote } from "./fees";
import { SPREAD_FRESHNESS_MS } from "./stats";

/** PricePoint-lite row for batched spread computation across many cards. */
export interface SpreadQuotePoint {
  cardId: string;
  marketplace: Marketplace;
  price: number;
  currency: string;
  priceType: string;
  capturedAt: Date;
}

export interface UserSpread {
  netPct: number;
  netPerCopy: number;
  buyMarketplace: Marketplace;
  sellMarketplace: Marketplace;
  buyPrice: number; // USD
  sellPrice: number; // USD
}

/**
 * Best executable cross-market spread per card under the given fee profiles,
 * from the latest FRESH market|sold quote per (card, marketplace). Mirrors
 * computeMarketStat's freshness rule: quotes older than `maxQuoteAgeMs`
 * (default 48h) are dropped entirely so a weeks-old capture can't pair with a
 * live one and fabricate arbitrage. Cards with fewer than two fresh
 * marketplaces are absent from the result.
 */
export function userBestSpreads(
  points: SpreadQuotePoint[],
  profiles: Partial<Record<Marketplace, FeeProfile>>,
  opts: { now: Date; maxQuoteAgeMs?: number }
): Map<string, UserSpread> {
  const maxQuoteAgeMs = opts.maxQuoteAgeMs ?? SPREAD_FRESHNESS_MS;
  const nowMs = opts.now.getTime();

  // Latest fresh quote per (cardId, marketplace); "low" asks never qualify.
  const latest = new Map<string, SpreadQuotePoint>();
  for (const p of points) {
    if (p.priceType !== "market" && p.priceType !== "sold") continue;
    if (nowMs - p.capturedAt.getTime() > maxQuoteAgeMs) continue;
    const key = `${p.cardId}:${p.marketplace}`;
    const cur = latest.get(key);
    if (!cur || p.capturedAt.getTime() > cur.capturedAt.getTime()) latest.set(key, p);
  }

  const quotesByCard = new Map<string, MarketQuote[]>();
  for (const p of latest.values()) {
    const arr = quotesByCard.get(p.cardId) ?? quotesByCard.set(p.cardId, []).get(p.cardId)!;
    arr.push({ marketplace: p.marketplace, price: p.price, currency: p.currency });
  }

  const out = new Map<string, UserSpread>();
  for (const [cardId, quotes] of quotesByCard) {
    const s = bestSpread(quotes, profiles);
    if (s) out.set(cardId, { netPct: s.netPct, netPerCopy: s.netPerCopy, buyMarketplace: s.buyMarketplace, sellMarketplace: s.sellMarketplace, buyPrice: s.buyPrice, sellPrice: s.sellPrice });
  }
  return out;
}
