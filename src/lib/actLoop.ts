// The "act" half of the loop: when a proposal is approved, inventory has to
// actually change. This module is the pure planning core — given the holdings
// a sell proposal can draw on, it decides which rows are consumed (oldest
// first), whether one row must be split, and how the proposal's total fees are
// apportioned across the sold rows. No I/O — unit-tested in actLoop.test.ts;
// the prisma writes live in src/app/actions/proposals.ts.

import { round2 } from "./math";

/** The slice of an InventoryItem the planner needs. Caller supplies rows
 * sorted oldest-first (acquiredAt asc) — order is consumption order. */
export interface HoldingLite {
  id: string;
  quantity: number;
}

/** A row consumed in full: mark the whole row sold with these fees. */
export interface FullSaleOp {
  id: string;
  quantity: number;
  soldFees: number;
}

/** A row consumed partially: keep `keepQuantity` on the original row and
 * create a new sold row carrying `soldQuantity` with `soldFees`. */
export interface SplitSaleOp {
  id: string;
  keepQuantity: number;
  soldQuantity: number;
  soldFees: number;
}

export interface SellPlan {
  full: FullSaleOp[];
  split: SplitSaleOp | null; // at most one row is ever split
  consumedQuantity: number; // min(qty, total owned)
  totalFees: number; // sum of per-row soldFees
}

/**
 * Plan which holdings a sell proposal consumes. Rows are eaten oldest-first;
 * a row larger than what remains is split (keep + new sold row). Total fees
 * (gross − netAfterFees, clamped ≥ 0) are apportioned per unit across the
 * sold rows via cumulative rounding, so when the full proposal quantity is
 * available the row fees sum exactly to round2(gross − netAfterFees).
 * Selling more than is owned consumes only what exists.
 */
export function planSellConsumption(
  holdings: HoldingLite[],
  qty: number,
  proposedPrice: number,
  netAfterFees: number
): SellPlan {
  const want = Math.max(0, Math.floor(qty));
  if (want === 0) return { full: [], split: null, consumedQuantity: 0, totalFees: 0 };
  const gross = proposedPrice * want;
  const proposalFees = Math.max(0, round2(gross - netAfterFees));

  const full: FullSaleOp[] = [];
  let split: SplitSaleOp | null = null;
  let remaining = want;
  let servedUnits = 0;
  let allocatedFees = 0;
  for (const h of holdings) {
    if (remaining <= 0) break;
    if (h.quantity <= 0) continue;
    const take = Math.min(h.quantity, remaining);
    // Cumulative per-unit apportionment: this row's fee is the increment of
    // the rounded running total, so rounding drift never accumulates.
    servedUnits += take;
    const target = round2((proposalFees * servedUnits) / want);
    const soldFees = round2(target - allocatedFees);
    allocatedFees = target;
    if (take === h.quantity) {
      full.push({ id: h.id, quantity: take, soldFees });
    } else {
      split = { id: h.id, keepQuantity: h.quantity - take, soldQuantity: take, soldFees };
    }
    remaining -= take;
  }
  return { full, split, consumedQuantity: want - remaining, totalFees: allocatedFees };
}

// ── Undo record ──────────────────────────────────────────────────────────────
// What approveProposal actually changed, stored as JSON inside the proposal's
// priceSnapshot under `_inventoryEffect` (no schema change) so undoDecision
// can reverse it exactly.

export interface BuyEffect {
  kind: "buy";
  createdItemId: string;
  removedWatch?: {
    targetBuyPrice: number | null;
    targetSellPrice: number | null;
    notes: string | null;
  };
}

export interface SellEffectRow {
  id: string;
  prev: {
    status: string;
    quantity: number;
    listedPrice: number | null;
    listedMarketplace: string | null;
  };
}

export interface SellEffect {
  kind: "sell";
  updated: SellEffectRow[];
  createdRowId?: string; // the split's new sold row, if any
}

export type InventoryEffect = BuyEffect | SellEffect;
