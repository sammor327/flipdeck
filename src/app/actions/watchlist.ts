"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/math";

export async function addWatch(cardId: string, targetBuyPrice?: number, targetSellPrice?: number, notes?: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  await prisma.watchlistItem.upsert({
    where: { userId_cardId: { userId: user.id, cardId } },
    create: { userId: user.id, cardId, targetBuyPrice: targetBuyPrice ?? null, targetSellPrice: targetSellPrice ?? null, notes: notes ?? null },
    update: { targetBuyPrice: targetBuyPrice ?? null, targetSellPrice: targetSellPrice ?? null, notes: notes ?? null },
  });
  revalidatePath("/watchlist");
  revalidatePath(`/cards/${cardId}`);
  return { ok: true };
}

/** null/undefined clears the target; a number must be finite and positive. */
function normalizeTarget(value: number | null | undefined): { ok: true; value: number | null } | { ok: false } {
  if (value == null) return { ok: true, value: null };
  if (!Number.isFinite(value) || value <= 0) return { ok: false };
  return { ok: true, value: round2(value) };
}

/**
 * Update only the provided target fields on a watchlist item — unlike addWatch's
 * upsert, this never clobbers notes or the other target. Pass null to clear.
 */
export async function updateWatchTargets(
  cardId: string,
  targets: { targetBuyPrice?: number | null; targetSellPrice?: number | null }
) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const data: { targetBuyPrice?: number | null; targetSellPrice?: number | null } = {};
  if ("targetBuyPrice" in targets) {
    const buy = normalizeTarget(targets.targetBuyPrice);
    if (!buy.ok) return { ok: false, error: "Target buy price must be a positive number" };
    data.targetBuyPrice = buy.value;
  }
  if ("targetSellPrice" in targets) {
    const sell = normalizeTarget(targets.targetSellPrice);
    if (!sell.ok) return { ok: false, error: "Target sell price must be a positive number" };
    data.targetSellPrice = sell.value;
  }
  if (Object.keys(data).length === 0) return { ok: true };

  const res = await prisma.watchlistItem.updateMany({ where: { userId: user.id, cardId }, data });
  if (res.count === 0) return { ok: false, error: "Not on your watchlist" };
  revalidatePath("/watchlist");
  return { ok: true };
}

export async function removeWatch(cardId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  await prisma.watchlistItem.deleteMany({ where: { userId: user.id, cardId } });
  revalidatePath("/watchlist");
  revalidatePath(`/cards/${cardId}`);
  return { ok: true };
}
