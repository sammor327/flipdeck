// Watchlist target-price evaluation. Pure: given an item's targets, the current
// price, and whether the user holds copies, decide whether a proposal should
// fire and on which side. The worker (tick.ts) does the I/O — loading items,
// dedup/cooldown, guardrails — this module just decides.
//
// Unit-tested in watchTargets.test.ts: buy/sell fires, equality boundaries,
// both-crossed precedence, missing targets, and the no-holdings sell skip.

import { formatMoney } from "./format";
import type { Side } from "./constants";

export interface WatchTargetsLike {
  targetBuyPrice: number | null;
  targetSellPrice: number | null;
}

export interface WatchTargetHit {
  side: Side;
  reason: string;
}

/**
 * Decide whether a watchlist item's target prices fire at `currentPrice`.
 *
 * Rules:
 * - Buy fires when `targetBuyPrice` is set and the price is at or below it.
 * - Sell fires when `targetSellPrice` is set, the price is at or above it, AND
 *   the user holds copies — a sell proposal with zero holdings is meaningless,
 *   so it is skipped entirely (no notification).
 * - If both fire (misconfigured targets, e.g. buy above sell), buy wins.
 */
export function evaluateWatchTarget(
  targets: WatchTargetsLike,
  currentPrice: number,
  hasHoldings: boolean
): WatchTargetHit | null {
  const { targetBuyPrice, targetSellPrice } = targets;
  if (targetBuyPrice != null && currentPrice <= targetBuyPrice) {
    return {
      side: "buy",
      reason: `Watch target — hit your buy target ${formatMoney(targetBuyPrice)} (now ${formatMoney(currentPrice)})`,
    };
  }
  if (targetSellPrice != null && currentPrice >= targetSellPrice && hasHoldings) {
    return {
      side: "sell",
      reason: `Watch target — hit your sell target ${formatMoney(targetSellPrice)} (now ${formatMoney(currentPrice)})`,
    };
  }
  return null;
}
