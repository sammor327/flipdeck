// Portfolio valuation helpers. Pure: pages fetch inventory + stats via Prisma,
// then call these to mark-to-market and compute P/L. Non-NM copies are priced
// from the NM market price via CONDITION_MULTIPLIER.

import type { Condition, ItemStatus } from "./constants";
import { conditionMultiplier } from "./constants";
import { pctChange, round2 } from "./math";

export interface HoldingInput {
  cardId: string;
  quantity: number;
  condition: Condition;
  costBasis: number; // per unit
  status: ItemStatus;
  nmMarketPrice: number | null; // current NM market price (USD)
  soldPrice?: number | null; // per unit, when sold
  soldFees?: number | null; // total fees on the sale
}

export interface ValuedHolding {
  marketPrice: number | null; // per unit, condition-adjusted
  marketValue: number; // × quantity
  costTotal: number;
  unrealizedPL: number;
  unrealizedPct: number | null;
}

export function priceForCondition(nm: number | null, condition: Condition): number | null {
  if (nm == null) return null;
  // conditionMultiplier (not direct indexing) so legacy rows with an
  // unrecognized condition string price as NM instead of NaN-poisoning totals.
  return round2(nm * conditionMultiplier(condition));
}

export function valueHolding(h: HoldingInput): ValuedHolding {
  const price = priceForCondition(h.nmMarketPrice, h.condition);
  const marketValue = round2((price ?? 0) * h.quantity);
  const costTotal = round2(h.costBasis * h.quantity);
  const unrealizedPL = round2(marketValue - costTotal);
  return {
    marketPrice: price,
    marketValue,
    costTotal,
    unrealizedPL,
    unrealizedPct: costTotal > 0 ? pctChange(costTotal, marketValue) : null,
  };
}

export interface PortfolioSummary {
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPct: number | null;
  quantity: number; // total copies owned/listed
  distinctCards: number;
  listedCount: number;
  listedValue: number;
  realizedPL: number; // from sold items
}

export function summarize(holdings: HoldingInput[]): PortfolioSummary {
  let marketValue = 0;
  let costBasis = 0;
  let quantity = 0;
  let listedCount = 0;
  let listedValue = 0;
  let realizedPL = 0;
  const distinct = new Set<string>();

  for (const h of holdings) {
    if (h.status === "sold") {
      // Legacy sales with no recorded price contribute nothing — matching
      // realizedPLFor()'s null (em-dash in the table) instead of booking a
      // fabricated total loss.
      if (h.soldPrice == null) continue;
      const proceeds = h.soldPrice * h.quantity - (h.soldFees ?? 0);
      realizedPL += proceeds - h.costBasis * h.quantity;
      continue;
    }
    const v = valueHolding(h);
    marketValue += v.marketValue;
    costBasis += v.costTotal;
    quantity += h.quantity;
    distinct.add(h.cardId);
    if (h.status === "listed") {
      listedCount += h.quantity;
      listedValue += v.marketValue;
    }
  }

  marketValue = round2(marketValue);
  costBasis = round2(costBasis);
  const unrealizedPL = round2(marketValue - costBasis);
  return {
    marketValue,
    costBasis,
    unrealizedPL,
    unrealizedPct: costBasis > 0 ? pctChange(costBasis, marketValue) : null,
    quantity,
    distinctCards: distinct.size,
    listedCount,
    listedValue: round2(listedValue),
    realizedPL: round2(realizedPL),
  };
}
