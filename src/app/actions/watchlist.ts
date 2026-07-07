"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export async function removeWatch(cardId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  await prisma.watchlistItem.deleteMany({ where: { userId: user.id, cardId } });
  revalidatePath("/watchlist");
  revalidatePath(`/cards/${cardId}`);
  return { ok: true };
}
