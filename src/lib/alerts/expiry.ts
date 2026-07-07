// Trade-proposal expiry + hindsight ("you missed / you dodged"). Pure and
// unit-tested (expiry.test.ts).

import type { ProposalStatus, Side } from "../constants";
import { UNDO_WINDOW_MS } from "../constants";
import { formatMoney, formatSignedMoney, formatSignedPercent } from "../format";
import { pctChange, round2 } from "../math";

export interface ProposalLike {
  side: Side;
  status: ProposalStatus;
  proposedPrice: number;
  expiresAt: Date;
  decidedAt?: Date | null;
  undoUntil?: Date | null;
}

export function isExpired(p: ProposalLike, now: Date): boolean {
  return p.status === "pending" && now.getTime() >= p.expiresAt.getTime();
}

/** Whether a just-decided proposal can still be undone. */
export function undoActive(p: ProposalLike, now: Date): boolean {
  if (!p.undoUntil) return false;
  return now.getTime() < p.undoUntil.getTime();
}

export function undoDeadline(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + UNDO_WINDOW_MS);
}

export type Verdict = "missed" | "dodged" | "flat";

export interface Hindsight {
  verdict: Verdict;
  deltaAbs: number; // signed price change since the proposal (currentPrice − proposedPrice)
  deltaPct: number | null;
  note: string;
}

/**
 * Compute hindsight for a proposal that was never executed (expired or declined).
 *
 * BUY not taken:  price up  → you MISSED a cheaper entry;  price down → you DODGED a further drop.
 * SELL not taken: price down → you MISSED selling high;    price up   → you DODGED (holding gained).
 */
export function computeHindsight(side: Side, proposedPrice: number, currentPrice: number): Hindsight {
  const deltaAbs = round2(currentPrice - proposedPrice);
  const deltaPct = pctChange(proposedPrice, currentPrice);
  let verdict: Verdict = "flat";
  if (Math.abs(deltaAbs) >= 0.01) {
    if (side === "buy") verdict = deltaAbs > 0 ? "missed" : "dodged";
    else verdict = deltaAbs < 0 ? "missed" : "dodged";
  }

  const now = formatMoney(currentPrice);
  const move = `${formatSignedMoney(deltaAbs)}${deltaPct != null ? ` (${formatSignedPercent(deltaPct)})` : ""}`;
  let note: string;
  if (verdict === "flat") {
    note = `Hindsight: now ${now} — essentially flat since the proposal.`;
  } else if (side === "buy") {
    note =
      verdict === "missed"
        ? `Hindsight: now ${now} — buying then would have saved ${move} per copy.`
        : `Hindsight: now ${now} — you dodged a ${move} move by not buying.`;
  } else {
    note =
      verdict === "missed"
        ? `Hindsight: now ${now} — selling then would have gained ${move} per copy.`
        : `Hindsight: now ${now} — holding gained ${move} vs selling.`;
  }
  return { verdict, deltaAbs, deltaPct, note };
}

/** The full state transition for an expiring proposal. */
export function expireProposal(
  p: ProposalLike,
  currentPrice: number
): { status: ProposalStatus; outcomePrice: number; outcomeNote: string } {
  const h = computeHindsight(p.side, p.proposedPrice, currentPrice);
  return { status: "expired", outcomePrice: currentPrice, outcomeNote: h.note };
}
