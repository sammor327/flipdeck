// Daily-spend-cap accounting shared by the worker (rule and watch-target
// fires) and the proposal actions (price edits). One query, one definition of
// "committed", so the cap can never drift between the write surfaces.

import { prisma } from "./db";

/**
 * Spend already committed today: pending + approved buys created since
 * server-local midnight (the cap is a per-calendar-day limit in the server's
 * timezone). `excludeProposalId` drops one proposal from the sum — an edit
 * replaces that proposal's old committed value, so it must not count against
 * its own headroom.
 */
export async function buysCommittedToday(
  userId: string,
  now: Date,
  opts: { excludeProposalId?: string } = {}
): Promise<number> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todaysBuys = await prisma.tradeProposal.findMany({
    where: {
      userId,
      side: "buy",
      status: { in: ["pending", "approved"] },
      createdAt: { gte: startOfToday },
      ...(opts.excludeProposalId ? { id: { not: opts.excludeProposalId } } : {}),
    },
    select: { proposedPrice: true, quantity: true },
  });
  return todaysBuys.reduce((s, p) => s + p.proposedPrice * p.quantity, 0);
}
