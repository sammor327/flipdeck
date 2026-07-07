// Fee-adjusted money math: net proceeds on a sale, cross-marketplace spread
// after fees, and the estimated edge on a buy. Pure and unit-tested (fees.test.ts).

import type { FeeProfile, Marketplace } from "./constants";
import { DEFAULT_FEE_PROFILES, EUR_USD } from "./constants";
import { round2 } from "./math";

export interface NetProceeds {
  gross: number; // sale price × qty
  feeAmount: number; // commission + payment fees
  shipping: number; // seller-borne shipping (per order)
  net: number; // what lands in your pocket
  netPerUnit: number;
  effectiveFeePct: number; // total fees+shipping as % of gross
}

/**
 * Net proceeds from selling `qty` copies at `unitPrice` under a fee profile.
 * Commission + payment fees apply to gross; shipping is a per-order flat cost.
 */
export function netProceeds(unitPrice: number, qty: number, fee: FeeProfile): NetProceeds {
  const gross = unitPrice * qty;
  const feeAmount = gross * ((fee.feePct + fee.paymentFeePct) / 100);
  const shipping = fee.shippingFlat; // once per order
  const net = gross - feeAmount - shipping;
  return {
    gross: round2(gross),
    feeAmount: round2(feeAmount),
    shipping: round2(shipping),
    net: round2(net),
    netPerUnit: round2(qty > 0 ? net / qty : 0),
    effectiveFeePct: gross > 0 ? round2(((feeAmount + shipping) / gross) * 100) : 0,
  };
}

export function feeFor(marketplace: Marketplace, overrides?: Partial<Record<Marketplace, FeeProfile>>): FeeProfile {
  return overrides?.[marketplace] ?? DEFAULT_FEE_PROFILES[marketplace];
}

/** Convert a price in a marketplace's native currency to USD (portfolio currency). */
export function toUsd(price: number, currency: string): number {
  if (currency === "EUR") return round2(price * EUR_USD);
  return round2(price);
}

export interface SpreadResult {
  buyMarketplace: Marketplace;
  sellMarketplace: Marketplace;
  buyPrice: number; // USD
  sellPrice: number; // USD
  fees: number; // USD, on the sell side
  netPerCopy: number; // USD, after buying and re-selling one copy
  netPct: number; // netPerCopy / buyPrice × 100
}

/**
 * Spread from buying one copy on `buy` and re-selling on `sell` after `sell`'s
 * fees. Prices are given in each marketplace's native currency + normalized to
 * USD so cross-region spreads are comparable.
 */
export function computeSpread(
  buy: { marketplace: Marketplace; price: number; currency: string },
  sell: { marketplace: Marketplace; price: number; currency: string },
  feeOverrides?: Partial<Record<Marketplace, FeeProfile>>
): SpreadResult {
  const buyUsd = toUsd(buy.price, buy.currency);
  const sellUsd = toUsd(sell.price, sell.currency);
  const proceeds = netProceeds(sellUsd, 1, feeFor(sell.marketplace, feeOverrides));
  const netPerCopy = round2(proceeds.net - buyUsd);
  return {
    buyMarketplace: buy.marketplace,
    sellMarketplace: sell.marketplace,
    buyPrice: buyUsd,
    sellPrice: sellUsd,
    fees: proceeds.feeAmount + proceeds.shipping,
    netPerCopy,
    netPct: buyUsd > 0 ? round2((netPerCopy / buyUsd) * 100) : 0,
  };
}

export interface MarketQuote {
  marketplace: Marketplace;
  price: number;
  currency: string;
}

/**
 * Best executable spread across every buy/sell marketplace pair. Considers only
 * distinct-marketplace pairs (you don't arbitrage a market against itself).
 */
export function bestSpread(
  quotes: MarketQuote[],
  feeOverrides?: Partial<Record<Marketplace, FeeProfile>>
): SpreadResult | null {
  let best: SpreadResult | null = null;
  for (const buy of quotes) {
    for (const sell of quotes) {
      if (buy.marketplace === sell.marketplace) continue;
      const s = computeSpread(buy, sell, feeOverrides);
      if (!best || s.netPct > best.netPct) best = s;
    }
  }
  return best;
}

/**
 * Estimated edge on a BUY proposal: if you buy `qty` at `buyPrice` and later
 * resell at `expectedSellPrice` on `sellMarketplace`, what do you net?
 */
export function buyEdge(
  buyPrice: number,
  qty: number,
  expectedSellPrice: number,
  sellMarketplace: Marketplace,
  feeOverrides?: Partial<Record<Marketplace, FeeProfile>>
): { net: number; pct: number } {
  const proceeds = netProceeds(expectedSellPrice, qty, feeFor(sellMarketplace, feeOverrides));
  const cost = buyPrice * qty;
  const net = round2(proceeds.net - cost);
  return { net, pct: cost > 0 ? round2((net / cost) * 100) : 0 };
}
