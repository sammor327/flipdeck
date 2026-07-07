// Shape a TradeProposal row into the ApprovalCard's view model. Pure (no
// Prisma) so both the dashboard and alerts pages can reuse it.

import type { ApprovalCardData } from "@/components/ApprovalCard";
import type { GameSlug, Marketplace, Side } from "./constants";
import { resolveExecution } from "./execution";
import { formatMoney, formatSignedMoney, formatSignedPercent } from "./format";
import { fromJson } from "./json";
import { pctChange } from "./math";

export interface ProposalRow {
  id: string;
  side: string;
  quantity: number;
  proposedPrice: number;
  marketplace: string;
  executionMode: string;
  rationale: string;
  netAfterFees: number;
  costBasis: number | null;
  priceSnapshot: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ProposalCardRow {
  name: string;
  setName: string;
  setCode: string;
  gameSlug: string;
  gameName: string;
  dataQuality: string;
}

export function buildApprovalData(p: ProposalRow, card: ProposalCardRow): ApprovalCardData {
  const side = p.side as Side;
  const snap = fromJson<Record<string, number>>(p.priceSnapshot, {});
  const qtyLabel = p.quantity > 1 ? ` ×${p.quantity}` : "";

  const evidence: ApprovalCardData["evidence"] = [];
  if (side === "sell") {
    evidence.push({ label: "Proposed price", value: `${formatMoney(p.proposedPrice)}${qtyLabel}` });
    evidence.push({ label: "Net after fees", value: formatSignedMoney(p.netAfterFees), tone: p.netAfterFees >= 0 ? "up" : "down" });
    const plPct = p.costBasis && p.costBasis > 0 ? pctChange(p.costBasis, p.proposedPrice) : null;
    evidence.push({
      label: "P/L vs basis",
      value: plPct != null ? formatSignedPercent(plPct) : "—",
      tone: plPct != null ? (plPct >= 0 ? "up" : "down") : undefined,
    });
  } else {
    evidence.push({ label: "Proposed", value: `${formatMoney(p.proposedPrice)}${qtyLabel}` });
    const median = snap.median90d ?? snap.median;
    evidence.push({ label: "90d median", value: median ? formatMoney(median) : "—" });
    const cost = p.proposedPrice * p.quantity;
    const pct = cost > 0 ? (p.netAfterFees / cost) * 100 : 0;
    evidence.push({ label: "Est. exit spread", value: formatSignedPercent(pct), tone: pct >= 0 ? "up" : "down" });
  }

  const exec = resolveExecution({
    marketplace: p.marketplace as Marketplace,
    side,
    card: { name: card.name, setName: card.setName, setCode: card.setCode, gameSlug: card.gameSlug as GameSlug },
  });

  return {
    id: p.id,
    side,
    quantity: p.quantity,
    proposedPrice: p.proposedPrice,
    marketplace: p.marketplace,
    executionMode: p.executionMode,
    rationale: p.rationale,
    netAfterFees: p.netAfterFees,
    expiresAt: p.expiresAt.getTime(),
    createdAt: p.createdAt.getTime(),
    card: {
      name: card.name,
      setName: card.setName,
      gameSlug: card.gameSlug,
      gameName: card.gameName,
      condition: "NM",
      beta: card.dataQuality === "beta",
    },
    evidence,
    execLabel: exec.label,
    execDescription: exec.description,
  };
}
