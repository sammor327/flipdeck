"use server";

import { revalidatePath } from "next/cache";
import type { Side } from "@/lib/constants";
import { UNDO_WINDOW_MS } from "@/lib/constants";
import { computeHindsight } from "@/lib/alerts/expiry";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

/** Approve → open the marketplace deep link, record the outcome, arm 5s undo. */
export async function approveProposal(id: string): Promise<ProposalActionResult> {
  const ctx = await owned(id);
  if (!ctx) return { ok: false, error: "Not found" };
  if (ctx.p.status !== "pending") return { ok: false, error: `Already ${ctx.p.status}` };

  const now = new Date();
  const undoUntil = new Date(now.getTime() + UNDO_WINDOW_MS);
  await prisma.tradeProposal.update({
    where: { id },
    data: { status: "approved", decidedAt: now, executedAt: now, undoUntil },
  });
  await prisma.notificationLog.updateMany({
    where: { proposalId: id },
    data: { actedOn: true, actedAt: now },
  });
  revalidatePath("/alerts");
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
 * if the original expiry has since passed). */
export async function undoDecision(id: string): Promise<ProposalActionResult> {
  const ctx = await owned(id);
  if (!ctx) return { ok: false, error: "Not found" };
  const now = new Date();
  if (!ctx.p.undoUntil || now.getTime() >= ctx.p.undoUntil.getTime()) {
    return { ok: false, error: "Undo window elapsed" };
  }

  if (now.getTime() < ctx.p.expiresAt.getTime()) {
    await prisma.tradeProposal.update({
      where: { id },
      data: { status: "pending", decidedAt: null, executedAt: null, undoUntil: null },
    });
  } else {
    const stat = await prisma.marketStat.findUnique({ where: { cardId: ctx.p.cardId } });
    const current = stat?.currentPrice ?? ctx.p.proposedPrice;
    const h = computeHindsight(ctx.p.side as Side, ctx.p.proposedPrice, current);
    await prisma.tradeProposal.update({
      where: { id },
      data: { status: "expired", decidedAt: null, executedAt: null, undoUntil: null, outcomePrice: current, outcomeNote: h.note },
    });
  }
  await prisma.notificationLog.updateMany({ where: { proposalId: id }, data: { actedOn: false, actedAt: null } });
  revalidatePath("/alerts");
  revalidatePath("/");
  return { ok: true };
}
