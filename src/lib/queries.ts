// Server-side data loaders shared across pages. These fetch via Prisma and
// shape rows using the pure helpers (portfolio, stats). Not "use server" — they
// are plain async functions called from server components.

import type { CardRow } from "./cardRow";
import { CONDITION_MULTIPLIER, type Condition } from "./constants";
import { prisma } from "./db";
import { round2 } from "./math";
import { summarize, valueHolding, type HoldingInput, type PortfolioSummary } from "./portfolio";

export interface InventoryRow {
  id: string;
  cardId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  gameSlug: string;
  gameName: string;
  imageUrl: string | null;
  condition: Condition;
  quantity: number;
  costBasis: number;
  marketPrice: number | null;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPct: number | null;
  delta7dPct: number | null;
  delta24hPct: number | null;
  spark: number[];
  tags: string[];
  status: string;
  listedPrice: number | null;
}

export function parseTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function sparkMap(cardIds: string[], days = 8): Promise<Map<string, number[]>> {
  if (cardIds.length === 0) return new Map();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await prisma.pricePoint.findMany({
    where: { cardId: { in: cardIds }, marketplace: "tcgplayer", condition: "NM", priceType: "market", capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    select: { cardId: true, price: true },
  });
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const arr = map.get(r.cardId) ?? map.set(r.cardId, []).get(r.cardId)!;
    arr.push(r.price);
  }
  return map;
}

export async function getInventoryRows(userId: string): Promise<{ rows: InventoryRow[]; summary: PortfolioSummary }> {
  const items = await prisma.inventoryItem.findMany({
    where: { portfolio: { userId } },
    include: { card: { include: { game: true, marketStat: true } } },
    orderBy: { createdAt: "asc" },
  });

  const activeCardIds = [...new Set(items.filter((i) => i.status !== "sold").map((i) => i.cardId))];
  const sparks = await sparkMap(activeCardIds);

  const rows: InventoryRow[] = [];
  const holdings: HoldingInput[] = [];
  for (const it of items) {
    const nm = it.card.marketStat?.currentPrice ?? null;
    holdings.push({
      cardId: it.cardId,
      quantity: it.quantity,
      condition: it.condition as Condition,
      costBasis: it.costBasis,
      status: it.status as HoldingInput["status"],
      nmMarketPrice: nm,
      soldPrice: it.soldPrice,
      soldFees: it.soldFees,
    });
    if (it.status === "sold") continue;
    const v = valueHolding({
      cardId: it.cardId,
      quantity: it.quantity,
      condition: it.condition as Condition,
      costBasis: it.costBasis,
      status: it.status as HoldingInput["status"],
      nmMarketPrice: nm,
    });
    rows.push({
      id: it.id,
      cardId: it.cardId,
      name: it.card.name,
      setCode: it.card.setCode,
      setName: it.card.setName,
      collectorNumber: it.card.collectorNumber,
      rarity: it.card.rarity,
      gameSlug: it.card.game.slug,
      gameName: it.card.game.name,
      imageUrl: it.card.imageUrl,
      condition: it.condition as Condition,
      quantity: it.quantity,
      costBasis: it.costBasis,
      marketPrice: v.marketPrice,
      marketValue: v.marketValue,
      unrealizedPL: v.unrealizedPL,
      unrealizedPct: v.unrealizedPct,
      delta7dPct: it.card.marketStat?.delta7dPct ?? null,
      delta24hPct: it.card.marketStat?.delta24hPct ?? null,
      spark: sparks.get(it.cardId) ?? [],
      tags: parseTags(it.tags),
      status: it.status,
      listedPrice: it.listedPrice,
    });
  }

  return { rows, summary: summarize(holdings) };
}

export async function trackedCardIds(userId: string): Promise<string[]> {
  const [inv, watch] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { portfolio: { userId }, status: { in: ["owned", "listed"] } },
      select: { cardId: true },
      distinct: ["cardId"],
    }),
    prisma.watchlistItem.findMany({ where: { userId }, select: { cardId: true } }),
  ]);
  return [...new Set([...inv.map((i) => i.cardId), ...watch.map((w) => w.cardId)])];
}

export interface MoverRow {
  cardId: string;
  name: string;
  setName: string;
  rarity: string;
  gameSlug: string;
  gameName: string;
  imageUrl: string | null;
  price: number;
  delta24hPct: number | null;
  delta7dPct: number | null;
  bestSpreadPct: number | null;
  spark: number[];
  owned: boolean;
}

export async function getTopMovers(userId: string, limit = 6): Promise<MoverRow[]> {
  const cardIds = await trackedCardIds(userId);
  if (cardIds.length === 0) return [];
  const [stats, sparks, ownedRows] = await Promise.all([
    prisma.marketStat.findMany({ where: { cardId: { in: cardIds } }, include: { card: { include: { game: true } } } }),
    sparkMap(cardIds),
    prisma.inventoryItem.findMany({
      where: { portfolio: { userId }, status: { in: ["owned", "listed"] }, cardId: { in: cardIds } },
      select: { cardId: true },
      distinct: ["cardId"],
    }),
  ]);
  const ownedSet = new Set(ownedRows.map((r) => r.cardId));
  const rows: MoverRow[] = stats.map((s) => ({
    cardId: s.cardId,
    name: s.card.name,
    setName: s.card.setName,
    rarity: s.card.rarity,
    gameSlug: s.card.game.slug,
    gameName: s.card.game.name,
    imageUrl: s.card.imageUrl,
    price: s.currentPrice,
    delta24hPct: s.delta24hPct,
    delta7dPct: s.delta7dPct,
    bestSpreadPct: s.bestSpreadPct,
    spark: sparks.get(s.cardId) ?? [],
    owned: ownedSet.has(s.cardId),
  }));
  rows.sort((a, b) => Math.abs(b.delta24hPct ?? 0) - Math.abs(a.delta24hPct ?? 0));
  return rows.slice(0, limit);
}

export interface PortfolioPoint {
  t: number;
  v: number;
}

/** Mark-to-market portfolio value per day, summed across current holdings. */
export async function getPortfolioSeries(userId: string): Promise<PortfolioPoint[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { portfolio: { userId }, status: { in: ["owned", "listed"] } },
    select: { cardId: true, quantity: true, condition: true },
  });
  if (items.length === 0) return [];
  const cardIds = [...new Set(items.map((i) => i.cardId))];
  const since = new Date(Date.now() - 95 * 24 * 3600 * 1000);
  const points = await prisma.pricePoint.findMany({
    where: { cardId: { in: cardIds }, marketplace: "tcgplayer", condition: "NM", priceType: "market", capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    select: { cardId: true, price: true, capturedAt: true },
  });

  // dateKey → { cardId → close }
  const dayKeys = new Set<string>();
  const perCardDay = new Map<string, Map<string, number>>();
  for (const p of points) {
    const key = p.capturedAt.toISOString().slice(0, 10);
    dayKeys.add(key);
    const m = perCardDay.get(p.cardId) ?? perCardDay.set(p.cardId, new Map()).get(p.cardId)!;
    m.set(key, p.price);
  }
  const keys = [...dayKeys].sort();

  // carry-forward each card across all days
  const carried = new Map<string, Map<string, number>>();
  for (const cardId of cardIds) {
    const src = perCardDay.get(cardId) ?? new Map();
    const out = new Map<string, number>();
    let last = 0;
    let seen = false;
    for (const k of keys) {
      if (src.has(k)) {
        last = src.get(k)!;
        seen = true;
      }
      out.set(k, seen ? last : 0);
    }
    carried.set(cardId, out);
  }

  return keys.map((k) => {
    let v = 0;
    for (const it of items) {
      const price = carried.get(it.cardId)?.get(k) ?? 0;
      v += price * it.quantity * CONDITION_MULTIPLIER[it.condition as Condition];
    }
    return { t: new Date(k + "T12:00:00Z").getTime(), v: round2(v) };
  });
}

export async function getDashboardStats(userId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [activeRules, firedThisWeek, actedThisWeek, pending, soonest] = await Promise.all([
    prisma.alertRule.count({ where: { userId, enabled: true } }),
    prisma.tradeProposal.count({ where: { userId, createdAt: { gte: weekAgo } } }),
    prisma.tradeProposal.count({ where: { userId, decidedAt: { gte: weekAgo }, status: { in: ["approved", "declined"] } } }),
    prisma.tradeProposal.count({ where: { userId, status: "pending" } }),
    prisma.tradeProposal.findFirst({ where: { userId, status: "pending" }, orderBy: { expiresAt: "asc" }, select: { expiresAt: true } }),
  ]);
  return { activeRules, firedThisWeek, actedThisWeek, pending, soonestExpiry: soonest?.expiresAt ?? null };
}

// ── CardRow builders for the reusable CardTable ──────────────────────────────

export async function getWatchlistRows(userId: string): Promise<CardRow[]> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    include: { card: { include: { game: true, marketStat: true } } },
    orderBy: { createdAt: "desc" },
  });
  const sparks = await sparkMap(items.map((i) => i.cardId));
  return items.map((it) => ({
    cardId: it.cardId,
    name: it.card.name,
    setCode: it.card.setCode,
    setName: it.card.setName,
    rarity: it.card.rarity,
    gameSlug: it.card.game.slug,
    gameName: it.card.game.name,
    imageUrl: it.card.imageUrl,
    price: it.card.marketStat?.currentPrice ?? null,
    delta24hPct: it.card.marketStat?.delta24hPct ?? null,
    delta7dPct: it.card.marketStat?.delta7dPct ?? null,
    spark: sparks.get(it.cardId) ?? [],
    targetBuyPrice: it.targetBuyPrice,
    targetSellPrice: it.targetSellPrice,
    notes: it.notes,
  }));
}

export async function getSpreadRows(userId: string): Promise<CardRow[]> {
  const cardIds = await trackedCardIds(userId);
  if (cardIds.length === 0) return [];
  const stats = await prisma.marketStat.findMany({
    where: { cardId: { in: cardIds }, bestSpreadPct: { not: null } },
    include: { card: { include: { game: true } } },
  });
  return stats.map((s) => ({
    cardId: s.cardId,
    name: s.card.name,
    setCode: s.card.setCode,
    setName: s.card.setName,
    rarity: s.card.rarity,
    gameSlug: s.card.game.slug,
    gameName: s.card.game.name,
    imageUrl: s.card.imageUrl,
    price: s.currentPrice,
    bestSpreadPct: s.bestSpreadPct,
    bestSpreadBuy: s.bestSpreadBuy,
    bestSpreadSell: s.bestSpreadSell,
    liquidityScore: s.liquidityScore,
  }));
}

/** Market-wide movers (all cards), for the dedicated Top Movers page. */
export async function getMoverRows(userId: string): Promise<CardRow[]> {
  const stats = await prisma.marketStat.findMany({ include: { card: { include: { game: true } } } });
  const cardIds = stats.map((s) => s.cardId);
  const [sparks, ownedRows] = await Promise.all([
    sparkMap(cardIds),
    prisma.inventoryItem.findMany({
      where: { portfolio: { userId }, status: { in: ["owned", "listed"] } },
      select: { cardId: true },
      distinct: ["cardId"],
    }),
  ]);
  const owned = new Set(ownedRows.map((r) => r.cardId));
  return stats.map((s) => ({
    cardId: s.cardId,
    name: s.card.name,
    setCode: s.card.setCode,
    setName: s.card.setName,
    rarity: s.card.rarity,
    gameSlug: s.card.game.slug,
    gameName: s.card.game.name,
    imageUrl: s.card.imageUrl,
    price: s.currentPrice,
    delta24hPct: s.delta24hPct,
    delta7dPct: s.delta7dPct,
    bestSpreadPct: s.bestSpreadPct,
    liquidityScore: s.liquidityScore,
    spark: sparks.get(s.cardId) ?? [],
    owned: owned.has(s.cardId),
  }));
}
