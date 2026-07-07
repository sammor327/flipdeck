// Shared row shape + column keys for the reusable CardTable (filter + sort).
// Lives here (not in the client component) so server pages/queries can build
// rows without importing a "use client" module.

export interface CardRow {
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  rarity: string;
  gameSlug: string;
  gameName: string;
  imageUrl?: string | null;
  price?: number | null;
  delta24hPct?: number | null;
  delta7dPct?: number | null;
  bestSpreadPct?: number | null;
  bestSpreadBuy?: string | null;
  bestSpreadSell?: string | null;
  liquidityScore?: number | null;
  spark?: number[];
  targetBuyPrice?: number | null;
  targetSellPrice?: number | null;
  notes?: string | null;
  owned?: boolean;
}

export type ColKey =
  | "card"
  | "game"
  | "price"
  | "delta24h"
  | "delta7d"
  | "spread"
  | "spreadRoute"
  | "liquidity"
  | "spark"
  | "targetBuy"
  | "targetSell"
  | "notes"
  | "action"
  | "watch";
