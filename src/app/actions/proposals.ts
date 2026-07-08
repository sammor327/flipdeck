"use server";

import { revalidatePath } from "next/cache";
import type { InventoryItem, Prisma, TradeProposal } from "@prisma/client";
import type { Marketplace, Side } from "@/lib/constants";
import { UNDO_WINDOW_MS } from "@/lib/constants";
import type { BuyEffect, InventoryEffect, SellEffect } from "@/lib/actLoop";
import { planSellConsumption } from "@/lib/actLoop";
import { computeHindsight } from "@/lib/alerts/expiry";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buyEdge, netProceeds } from "@/lib/fees";
import { mergeFeeProfiles } from "@/lib/feeProfiles";
import { fromJson, toJson } from "@/lib/json";
import { round2 } from "@/lib/math";

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
 * record of exactly what changed, so undoDecision can reverse it. Runs on the
 * caller's transaction client so the claim + effects commit (or roll back)
 * together. */
async function applyInventoryEffect(db: Prisma.TransactionClient, userId: string, p: TradeProposal, now: Date): Promise<InventoryEffect> {
  if ((p.side as Side) === "buy") {
    // Find-or-create the user's portfolio (same pattern as actions/inventory.ts).
    const existing = await db.portfolio.findFirst({ where: { userId } });
    const pid = existing?.id ?? (await db.portfolio.create({ data: { userId } })).id;
    const created = await db.inventoryItem.create({
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
    const watch = await db.watchlistItem.findUnique({
      where: { userId_cardId: { userId, cardId: p.cardId } },
    });
    if (watch) {
      await db.watchlistItem.delete({ where: { id: watch.id } });
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
  const holdings = await db.inventoryItem.findMany({
    where: { portfolio: { userId }, cardId: p.cardId, status: { in: ["owned", "listed"] } },
    orderBy: { acquiredAt: "asc" },
  });
  const plan = planSellConsumption(holdings, p.quantity, p.proposedPrice, p.netAfterFees);
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const effect: SellEffect = { kind: "sell", updated: [] };
  for (const op of plan.full) {
    const row = byId.get(op.id)!;
    effect.updated.push(prevOf(row));
    await db.inventoryItem.update({
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
    await db.inventoryItem.update({ where: { id: row.id }, data: { quantity: plan.split.keepQuantity } });
    const createdRow = await db.inventoryItem.create({
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

/** Reverse exactly what applyInventoryEffect recorded (undo window). Runs on
 * the caller's transaction client. */
async function reverseInventoryEffect(db: Prisma.TransactionClient, effect: InventoryEffect, userId: string, cardId: string) {
  if (effect.kind === "buy") {
    await db.inventoryItem.deleteMany({ where: { id: effect.createdItemId } });
    if (effect.removedWatch) {
      await db.watchlistItem.upsert({
        where: { userId_cardId: { userId, cardId } },
        create: { userId, cardId, ...effect.removedWatch },
        update: effect.removedWatch,
      });
    }
    return;
  }
  if (effect.createdRowId) {
    await db.inventoryItem.deleteMany({ where: { id: effect.createdRowId } });
  }
  for (const row of effect.updated) {
    await db.inventoryItem.update({
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
  // expiresAt is authoritative even before the worker sweep flips the row — a
  // stale tab or deep link must not approve a proposal that should have expired.
  if (ctx.p.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "Already expired" };
  const undoUntil = new Date(now.getTime() + UNDO_WINDOW_MS);
  // Claim the pending row atomically BEFORE any side effects — the conditional
  // updateMany is the gate that stops two racing approvals from both applying
  // inventory effects (expiresAt > now keeps the expiry check atomic too).
  // Claim + effects + undo record share one transaction so a crash mid-way
  // rolls the claim back rather than stranding an approved row with no effects
  // applied.
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.tradeProposal.updateMany({
      where: { id, userId: ctx.user.id, status: "pending", expiresAt: { gt: now } },
      data: { status: "approved", decidedAt: now, executedAt: now, undoUntil },
    });
    if (claim.count !== 1) return false;
    const effect = await applyInventoryEffect(tx, ctx.user.id, ctx.p, now);
    const snapshot = fromJson<Record<string, unknown>>(ctx.p.priceSnapshot, {});
    await tx.tradeProposal.update({
      where: { id },
      data: { priceSnapshot: toJson({ ...snapshot, _inventoryEffect: effect }) },
    });
    return true;
  });
  if (!claimed) {
    // Someone else (other tab, retry, expiry sweep) got there first.
    const fresh = await prisma.tradeProposal.findFirst({ where: { id, userId: ctx.user.id } });
    return { ok: false, error: `Already ${fresh?.status ?? ctx.p.status}` };
  }
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
  // Same expiry rule as approve: past-expiry rows belong to the worker sweep.
  if (ctx.p.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "Already expired" };
  const undoUntil = new Date(now.getTime() + UNDO_WINDOW_MS);
  // Same conditional-claim pattern as approve: only the actor that flips the
  // row off "pending" (before it expires) proceeds.
  const claim = await prisma.tradeProposal.updateMany({
    where: { id, userId: ctx.user.id, status: "pending", expiresAt: { gt: now } },
    data: { status: "declined", decidedAt: now, undoUntil },
  });
  if (claim.count !== 1) {
    const fresh = await prisma.tradeProposal.findFirst({ where: { id, userId: ctx.user.id } });
    return { ok: false, error: `Already ${fresh?.status ?? ctx.p.status}` };
  }
  await prisma.notificationLog.updateMany({ where: { proposalId: id }, data: { actedOn: true, actedAt: now } });
  revalidatePath("/alerts");
  revalidatePath("/");
  return { ok: true, undoUntil: undoUntil.getTime() };
}

/** Edit a pending proposal's price → recompute the after-fee net exactly the
 * way the worker did when it created the proposal (see createProposal in
 * lib/worker/tick.ts). The priceSnapshot is deliberately left untouched: it
 * stays the evidence of what the rule saw, while proposedPrice/netAfterFees
 * describe what the user will actually execute (hindsight math reads
 * proposedPrice, so it follows the edit naturally). */
export async function editProposalPrice(id: string, newPrice: number): Promise<ProposalActionResult> {
  const ctx = await owned(id);
  if (!ctx) return { ok: false, error: "Not found" };
  if (ctx.p.status !== "pending") return { ok: false, error: `Already ${ctx.p.status}` };
  if (!Number.isFinite(newPrice) || newPrice <= 0) return { ok: false, error: "Price must be greater than $0" };
  const price = round2(newPrice);
  if (price <= 0) return { ok: false, error: "Price must be greater than $0" };

  const now = new Date();
  // Same expiry rule as approve/decline: past-expiry rows belong to the worker sweep.
  if (ctx.p.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "Already expired" };

  const settings = await prisma.userSettings.findUnique({ where: { userId: ctx.user.id } });
  const profiles = mergeFeeProfiles(settings?.feeProfiles);
  const marketplace = ctx.p.marketplace as Marketplace;
  const fee = profiles[marketplace];
  if (!fee) return { ok: false, error: "Unknown marketplace" };

  // BUY edge needs an expected resale price: live stat → the median the rule
  // saw at proposal time → the new price itself.
  const stat = await prisma.marketStat.findUnique({ where: { cardId: ctx.p.cardId } });
  const snapshot = fromJson<Record<string, unknown>>(ctx.p.priceSnapshot, {});
  const snapMedian = typeof snapshot.median90d === "number" && Number.isFinite(snapshot.median90d) ? snapshot.median90d : null;
  const median90d = stat?.median90d ?? snapMedian ?? price;

  const netAfterFees =
    (ctx.p.side as Side) === "sell"
      ? netProceeds(price, ctx.p.quantity, fee).net
      : buyEdge(price, ctx.p.quantity, median90d, marketplace, profiles).net;

  // Same conditional-claim pattern as approve/decline: only a still-pending,
  // unexpired row takes the edit — approved/declined/expired rows are never
  // modified, and decidedAt/undoUntil/status stay untouched.
  const claim = await prisma.tradeProposal.updateMany({
    where: { id, userId: ctx.user.id, status: "pending", expiresAt: { gt: now } },
    data: { proposedPrice: price, netAfterFees },
  });
  if (claim.count !== 1) {
    const fresh = await prisma.tradeProposal.findFirst({ where: { id, userId: ctx.user.id } });
    if (fresh?.status === "pending") return { ok: false, error: "Already expired" };
    return { ok: false, error: `Already ${fresh?.status ?? ctx.p.status}` };
  }
  revalidatePath("/alerts");
  revalidatePath("/");
  return { ok: true };
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

  // Reading the snapshot before the claim is safe: the claim below is the
  // gate, and once we win it no other actor can touch the undo record.
  const snapshot = fromJson<Record<string, unknown>>(ctx.p.priceSnapshot, {});
  const effect = snapshot._inventoryEffect as InventoryEffect | undefined;
  if (effect) delete snapshot._inventoryEffect;
  const priceSnapshot = toJson(snapshot);

  const claimed = await prisma.$transaction(async (tx) => {
    // Claim the undo window atomically — a second concurrent undo loses here.
    const claim = await tx.tradeProposal.updateMany({
      where: { id, userId: ctx.user.id, undoUntil: { gt: now } },
      data: { undoUntil: null },
    });
    if (claim.count !== 1) return false;
    if (effect) await reverseInventoryEffect(tx, effect, ctx.user.id, ctx.p.cardId);

    if (now.getTime() < ctx.p.expiresAt.getTime()) {
      await tx.tradeProposal.update({
        where: { id },
        data: { status: "pending", decidedAt: null, executedAt: null, undoUntil: null, priceSnapshot },
      });
    } else {
      const stat = await tx.marketStat.findUnique({ where: { cardId: ctx.p.cardId } });
      const current = stat?.currentPrice ?? ctx.p.proposedPrice;
      const h = computeHindsight(ctx.p.side as Side, ctx.p.proposedPrice, current);
      await tx.tradeProposal.update({
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
    return true;
  });
  if (!claimed) return { ok: false, error: "Undo window elapsed" };
  await prisma.notificationLog.updateMany({ where: { proposalId: id }, data: { actedOn: false, actedAt: null } });
  revalidatePath("/alerts");
  revalidatePath("/inventory");
  revalidatePath("/watchlist");
  revalidatePath("/");
  return { ok: true };
}
