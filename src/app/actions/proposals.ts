"use server";

import { revalidatePath } from "next/cache";
import type { InventoryItem, TradeProposal } from "@prisma/client";
import type { Side } from "@/lib/constants";
import { UNDO_WINDOW_MS } from "@/lib/constants";
import type { BuyEffect, InventoryEffect, SellEffect } from "@/lib/actLoop";
import { planSellConsumption } from "@/lib/actLoop";
import { computeHindsight } from "@/lib/alerts/expiry";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";

export interface ProposalActionResult {
  ok: boolean;
  error?: string;
  deepLink?: string;
  executionMode?: string;
  undoUntil?: number; // epoch ms
}

async function owned(id: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const p = await prisma.tradeProposal.findFirst({ where: { id, userId: user.id } });
  return p ? { user, p } : null;
}

function prevOf(row: InventoryItem) {
  return {
    id: row.id,
    prev: {
      status: row.status,
      quantity: row.quantity,
      listedPrice: row.listedPrice,
      listedMarketplace: row.listedMarketplace,
    },
  };
}

/** Apply the approved proposal's inventory/watchlist side effects and return a
 * record of exactly what changed, so undoDecision can reverse it. */
async function applyInventoryEffect(userId: string, p: TradeProposal, now: Date): Promise<InventoryEffect> {
  if ((p.side as Side) === "buy") {
    // Find-or-create the user's portfolio (same pattern as actions/inventory.ts).
    const existing = await prisma.portfolio.findFirst({ where: { userId } });
    const pid = existing?.id ?? (await prisma.portfolio.create({ data: { userId } })).id;
    const created = await prisma.inventoryItem.create({
      data: {
        portfolioId: pid,
        cardId: p.cardId,
        quantity: p.quantity,
        condition: "NM",
        costBasis: p.proposedPrice,
        status: "owned",
      },
    });
    const effect: BuyEffect = { kind: "buy", createdItemId: created.id };
    // The card graduated from "watching" to "owned" — one-tap move.
    const watch = await prisma.watchlistItem.findUnique({
      where: { userId_cardId: { userId, cardId: p.cardId } },
    });
    if (watch) {
      await prisma.watchlistItem.delete({ where: { id: watch.id } });
      effect.removedWatch = {
        targetBuyPrice: watch.targetBuyPrice,
        targetSellPrice: watch.targetSellPrice,
        notes: watch.notes,
      };
    }
    return effect;
  }

  // SELL: consume holdings oldest-first per the pure planner. An empty plan
  // (copies sold manually in the meantime) still approves cleanly.
  const holdings = await prisma.inventoryItem.findMany({
    where: { portfolio: { userId }, cardId: p.cardId, status: { in: ["owned", "listed"] } },
    orderBy: { acquiredAt: "asc" },
  });
  const plan = planSellConsumption(holdings, p.quantity, p.proposedPrice, p.netAfterFees);
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const effect: SellEffect = { kind: "sell", updated: [] };
  for (const op of plan.full) {
    const row = byId.get(op.id)!;
    effect.updated.push(prevOf(row));
    await prisma.inventoryItem.update({
      where: { id: op.id },
      data: {
        status: "sold",
        soldPrice: p.proposedPrice,
        soldFees: op.soldFees,
        soldAt: now,
        listedPrice: null,
        listedMarketplace: null,
      },
    });
  }
  if (plan.split) {
    const row = byId.get(plan.split.id)!;
    effect.updated.push(prevOf(row));
    await prisma.inventoryItem.update({ where: { id: row.id }, data: { quantity: plan.split.keepQuantity } });
    const createdRow = await prisma.inventoryItem.create({
      data: {
        portfolioId: row.portfolioId,
        cardId: row.cardId,
        quantity: plan.split.soldQuantity,
        condition: row.condition,
        costBasis: row.costBasis,
        acquiredAt: row.acquiredAt,
        location: row.location,
        tags: row.tags,
        status: "sold",
        soldPrice: p.proposedPrice,
        soldFees: plan.split.soldFees,
        soldAt: now,
      },
    });
    effect.createdRowId = createdRow.id;
  }
  return effect;
}

/** Reverse exactly what applyInventoryEffect recorded (undo window). */
async function reverseInventoryEffect(effect: InventoryEffect, userId: string, cardId: string) {
  if (effect.kind === "buy") {
    await prisma.inventoryItem.deleteMany({ where: { id: effect.createdItemId } });
    if (effect.removedWatch) {
      await prisma.watchlistItem.upsert({
        where: { userId_cardId: { userId, cardId } },
        create: { userId, cardId, ...effect.removedWatch },
        update: effect.removedWatch,
      });
    }
    return;
  }
  if (effect.createdRowId) {
    await prisma.inventoryItem.deleteMany({ where: { id: effect.createdRowId } });
  }
  for (const row of effect.updated) {
    await prisma.inventoryItem.update({
      where: { id: row.id },
      data: { ...row.prev, soldPrice: null, soldFees: null, soldAt: null },
    });
  }
}

/** Approve → apply the inventory/watchlist effects, open the marketplace deep
 * link, record the outcome (with an undo record inside priceSnapshot), arm 5s
 * undo. */
export async function approveProposal(id: string): Promise<ProposalActionResult> {
  const ctx = await owned(id);
  if (!ctx) return { ok: false, error: "Not found" };
  if (ctx.p.status !== "pending") return { ok: false, error: `Already ${ctx.p.status}` };

  const now = new Date();
  const undoUntil = new Date(now.getTime() + UNDO_WINDOW_MS);
  const effect = await applyInventoryEffect(ctx.user.id, ctx.p, now);
  const snapshot = fromJson<Record<string, unknown>>(ctx.p.priceSnapshot, {});
  await prisma.tradeProposal.update({
    where: { id },
    data: {
      status: "approved",
      decidedAt: now,
      executedAt: now,
      undoUntil,
      priceSnapshot: toJson({ ...snapshot, _inventoryEffect: effect }),
    },
  });
  await prisma.notificationLog.updateMany({
    where: { proposalId: id },
    data: { actedOn: true, actedAt: now },
  });
  revalidatePath("/alerts");
  revalidatePath("/inventory");
  revalidatePath("/watchlist");
  revalidatePath("/");
  return { ok: true, deepLink: ctx.p.deepLink, executionMode: ctx.p.executionMode, undoUntil: undoUntil.getTime() };
}

/** Decline → record the outcome, arm 5s undo. */
export async function declineProposal(id: string): Promise<ProposalActionResult> {
  const ctx = await owned(id);
  if (!ctx) return { ok: false, error: "Not found" };
  if (ctx.p.status !== "pending") return { ok: false, error: `Already ${ctx.p.status}` };

  const now = new Date();
  const undoUntil = new Date(now.getTime() + UNDO_WINDOW_MS);
  await prisma.tradeProposal.update({
    where: { id },
    data: { status: "declined", decidedAt: now, undoUntil },
  });
  await prisma.notificationLog.updateMany({ where: { proposalId: id }, data: { actedOn: true, actedAt: now } });
  revalidatePath("/alerts");
  revalidatePath("/");
  return { ok: true, undoUntil: undoUntil.getTime() };
}

/** Undo a just-made decision within the 5s window → back to pending (or expired
 * if the original expiry has since passed), reversing any inventory/watchlist
 * effects an approval applied. */
export async function undoDecision(id: string): Promise<ProposalActionResult> {
  const ctx = await owned(id);
  if (!ctx) return { ok: false, error: "Not found" };
  const now = new Date();
  if (!ctx.p.undoUntil || now.getTime() >= ctx.p.undoUntil.getTime()) {
    return { ok: false, error: "Undo window elapsed" };
  }

  const snapshot = fromJson<Record<string, unknown>>(ctx.p.priceSnapshot, {});
  const effect = snapshot._inventoryEffect as InventoryEffect | undefined;
  if (effect) {
    await reverseInventoryEffect(effect, ctx.user.id, ctx.p.cardId);
    delete snapshot._inventoryEffect;
  }
  const priceSnapshot = toJson(snapshot);

  if (now.getTime() < ctx.p.expiresAt.getTime()) {
    await prisma.tradeProposal.update({
      where: { id },
      data: { status: "pending", decidedAt: null, executedAt: null, undoUntil: null, priceSnapshot },
    });
  } else {
    const stat = await prisma.marketStat.findUnique({ where: { cardId: ctx.p.cardId } });
    const current = stat?.currentPrice ?? ctx.p.proposedPrice;
    const h = computeHindsight(ctx.p.side as Side, ctx.p.proposedPrice, current);
    await prisma.tradeProposal.update({
      where: { id },
      data: {
        status: "expired",
        decidedAt: null,
        executedAt: null,
        undoUntil: null,
        outcomePrice: current,
        outcomeNote: h.note,
        priceSnapshot,
      },
    });
  }
  await prisma.notificationLog.updateMany({ where: { proposalId: id }, data: { actedOn: false, actedAt: null } });
  revalidatePath("/alerts");
  revalidatePath("/inventory");
  revalidatePath("/watchlist");
  revalidatePath("/");
  return { ok: true };
}
