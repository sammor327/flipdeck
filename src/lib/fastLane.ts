// Fast-lane membership: which cards the 5-minute worker lane price-refreshes.
// A card is fast-laned when an enabled alert rule resolves to it OR a
// watchlist item carries a target buy/sell price for it (the cycle-3 watch
// targets store no AlertRule row, so rules alone under-count). Shared by the
// worker's fastLaneOnly tick (global set) and the sidebar count (per-user set).

import { prisma } from "./db";

/**
 * Card ids an alert rule applies to: its own card, every card on the owner's
 * watchlist, or every distinct owned/listed card in the owner's inventory.
 */
export async function resolveRuleCardIds(rule: {
  scope: string;
  cardId: string | null;
  userId: string;
}): Promise<string[]> {
  if (rule.scope === "card") return rule.cardId ? [rule.cardId] : [];
  if (rule.scope === "watchlist") {
    const items = await prisma.watchlistItem.findMany({ where: { userId: rule.userId }, select: { cardId: true } });
    return items.map((i) => i.cardId);
  }
  // inventory
  const items = await prisma.inventoryItem.findMany({
    where: { portfolio: { userId: rule.userId }, status: { in: ["owned", "listed"] } },
    select: { cardId: true },
    distinct: ["cardId"],
  });
  return items.map((i) => i.cardId);
}

/**
 * The fast-lane card set: the union of every enabled rule's resolved cards and
 * every watchlist item with a target buy or sell price. Pass `userId` to scope
 * the set to one user (sidebar count); omit it for the worker's global set.
 */
export async function fastLaneCardIds(userId?: string): Promise<Set<string>> {
  const ids = new Set<string>();

  const rules = await prisma.alertRule.findMany({
    where: { enabled: true, ...(userId ? { userId } : {}) },
    select: { scope: true, cardId: true, userId: true },
  });
  for (const rule of rules) (await resolveRuleCardIds(rule)).forEach((id) => ids.add(id));

  const targeted = await prisma.watchlistItem.findMany({
    where: {
      OR: [{ targetBuyPrice: { not: null } }, { targetSellPrice: { not: null } }],
      ...(userId ? { userId } : {}),
    },
    select: { cardId: true },
  });
  for (const item of targeted) ids.add(item.cardId);

  return ids;
}
