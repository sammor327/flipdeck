// Stat engine: fold a card's append-only price history into the cached
// MarketStat rollup (deltas, volatility, 90d band, best cross-market spread,
// liquidity). Pure given the history array; the worker persists the result.

import type { Condition, Marketplace } from "./constants";
import { DEFAULT_FEE_PROFILES } from "./constants";
import { bestSpread, toUsd, type MarketQuote } from "./fees";
import {
  computeDeltas,
  estimateSalesPerDay,
  HOUR_MS,
  liquidityScore,
  maxOver,
  median,
  minOver,
  round2,
  toDailyCloses,
  volatilityPct,
  type PricePointLite,
} from "./math";

export interface StatPoint {
  marketplace: Marketplace;
  condition: Condition;
  priceType: "market" | "low" | "sold";
  price: number;
  currency: string;
  listingCount?: number | null;
  capturedAt: Date;
}

export interface MarketStatComputed {
  marketplace: Marketplace;
  condition: Condition;
  currentPrice: number;
  currency: "USD";
  delta24hPct: number | null;
  delta7dPct: number | null;
  delta30dPct: number | null;
  volatility: number | null;
  bestSpreadPct: number | null;
  bestSpreadBuy: string | null;
  bestSpreadSell: string | null;
  liquidityScore: number | null;
  listingCount: number | null;
  low90d: number | null;
  high90d: number | null;
  median90d: number | null;
}

const DEFAULT_MARKETPLACE: Marketplace = "tcgplayer";
const DEFAULT_CONDITION: Condition = "NM";

// Quotes older than this cannot participate in the cross-market spread: the
// worker refreshes hourly, so 48h tolerates weekend gaps while keeping a
// weeks-old cardmarket/eBay capture from pairing with today's quote and
// fabricating arbitrage.
export const SPREAD_FRESHNESS_MS = 48 * HOUR_MS;

export function computeMarketStat(
  points: StatPoint[],
  opts: { marketplace?: Marketplace; condition?: Condition; now?: Date; maxQuoteAgeMs?: number } = {}
): MarketStatComputed | null {
  const marketplace = opts.marketplace ?? DEFAULT_MARKETPLACE;
  const condition = opts.condition ?? DEFAULT_CONDITION;

  // Primary series drives the headline number + deltas (NM market, USD).
  const primary: (PricePointLite & { listingCount?: number | null })[] = points
    .filter((p) => p.marketplace === marketplace && p.condition === condition && p.priceType === "market")
    .map((p) => ({ price: toUsd(p.price, p.currency), capturedAt: p.capturedAt, listingCount: p.listingCount ?? null }))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  if (primary.length === 0) return null;

  const currentPrice = primary[primary.length - 1].price;
  const deltas = computeDeltas(primary, opts.now);
  const listingCount = primary[primary.length - 1].listingCount ?? null;
  const salesPerDay = estimateSalesPerDay(primary, 7, opts.now);

  // Best executable cross-market spread from the latest FRESH quote per
  // marketplace. Stale quotes are dropped entirely so they can't pair with a
  // live one; the primary series above is deliberately unaffected.
  const maxQuoteAgeMs = opts.maxQuoteAgeMs ?? SPREAD_FRESHNESS_MS;
  const nowMs = (opts.now ?? primary[primary.length - 1].capturedAt).getTime();
  const latestByMarket = new Map<Marketplace, StatPoint>();
  for (const p of points) {
    if (p.condition !== condition) continue;
    if (p.priceType !== "market" && p.priceType !== "sold") continue;
    if (nowMs - p.capturedAt.getTime() > maxQuoteAgeMs) continue;
    const cur = latestByMarket.get(p.marketplace);
    if (!cur || p.capturedAt.getTime() > cur.capturedAt.getTime()) latestByMarket.set(p.marketplace, p);
  }
  const quotes: MarketQuote[] = [...latestByMarket.values()].map((p) => ({
    marketplace: p.marketplace,
    price: p.price,
    currency: p.currency,
  }));
  const spread = bestSpread(quotes, DEFAULT_FEE_PROFILES);

  return {
    marketplace,
    condition,
    currentPrice: round2(currentPrice),
    currency: "USD",
    delta24hPct: deltas.delta24hPct,
    delta7dPct: deltas.delta7dPct,
    delta30dPct: deltas.delta30dPct,
    volatility: round2(volatilityPct(primary, 30, opts.now)),
    bestSpreadPct: spread ? spread.netPct : null,
    bestSpreadBuy: spread ? spread.buyMarketplace : null,
    bestSpreadSell: spread ? spread.sellMarketplace : null,
    liquidityScore: liquidityScore(listingCount, salesPerDay),
    listingCount,
    low90d: minOver(primary, 90, opts.now),
    high90d: maxOver(primary, 90, opts.now),
    median90d: median(toDailyCloses(primary, 90, opts.now)),
  };
}
