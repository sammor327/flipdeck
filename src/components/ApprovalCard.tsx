"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveProposal, declineProposal, undoDecision } from "@/app/actions/proposals";
import { UNDO_WINDOW_MS } from "@/lib/constants";
import { formatCountdown, formatMoney } from "@/lib/format";
import { CardArt } from "./CardArt";
import { GameDot } from "./GameChip";
import { useNow } from "./useNow";

export interface ApprovalCardData {
  id: string;
  side: "buy" | "sell";
  quantity: number;
  proposedPrice: number;
  marketplace: string;
  executionMode: string;
  rationale: string;
  netAfterFees: number;
  expiresAt: number; // ms
  createdAt: number; // ms
  card: { name: string; setName: string; gameSlug: string; gameName: string; condition: string; beta?: boolean; imageUrl?: string | null };
  evidence: { label: string; value: string; tone?: "up" | "down" }[];
  execLabel: string;
  execDescription: string;
}

export function ApprovalCard({ data, compact = false }: { data: ApprovalCardData; compact?: boolean }) {
  const router = useRouter();
  const now = useNow(1000);
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<null | { kind: "approved" | "declined"; until: number; deepLink?: string }>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = data.expiresAt - now;
  const duration = Math.max(1, data.expiresAt - data.createdAt);
  const frac = Math.max(0, Math.min(1, remaining / duration));
  const expired = remaining <= 0;

  // Auto-clear the undo bar when its window ends → refresh to reflect final state.
  useEffect(() => {
    if (decision && now >= decision.until) {
      setDecision(null);
      router.refresh();
    }
  }, [decision, now, router]);

  const sideLabel = data.side === "sell" ? `SELL ${data.quantity}` : `BUY ${data.quantity}`;
  const sideClass = data.side === "sell" ? "side-sell" : "side-buy";

  const doApprove = () =>
    startTransition(async () => {
      setError(null);
      const res = await approveProposal(data.id);
      if (!res.ok) return setError(res.error ?? "Failed");
      if (res.deepLink) window.open(res.deepLink, "_blank", "noopener,noreferrer");
      setDecision({ kind: "approved", until: res.undoUntil ?? Date.now() + UNDO_WINDOW_MS, deepLink: res.deepLink });
    });

  const doDecline = () =>
    startTransition(async () => {
      setError(null);
      const res = await declineProposal(data.id);
      if (!res.ok) return setError(res.error ?? "Failed");
      setDecision({ kind: "declined", until: res.undoUntil ?? Date.now() + UNDO_WINDOW_MS });
    });

  const doUndo = () =>
    startTransition(async () => {
      await undoDecision(data.id);
      setDecision(null);
      router.refresh();
    });

  if (decision) {
    const secs = Math.max(0, Math.ceil((decision.until - now) / 1000));
    return (
      <div className="undo" role="status">
        {decision.kind === "approved" ? "✓" : "↓"}{" "}
        <span>
          {decision.kind === "approved" ? "Approved" : "Declined"} — <b>{data.card.name}</b>{" "}
          {decision.kind === "approved" ? `· ${data.execLabel.toLowerCase()}…` : ""}
        </span>
        <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={doUndo} disabled={pending}>
          Undo ({secs}s)
        </button>
      </div>
    );
  }

  return (
    <div className={`apr ${!compact && frac < 0.5 ? "hot" : ""}`}>
      <div style={{ display: "flex", gap: 12 }}>
        <CardArt name={data.card.name} gameSlug={data.card.gameSlug} setCode={data.card.setName} imageUrl={data.card.imageUrl} size={compact ? "thumb" : "sm"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row1">
            <b>{data.card.name}</b>
            <span className={`side-tag ${sideClass}`}>{sideLabel}</span>
          </div>
          <div className="chip" style={{ marginTop: 3 }}>
            <GameDot slug={data.card.gameSlug} />
            {data.card.gameName} · {data.card.setName} · {data.card.condition}
            {data.card.beta ? <span className="badge-beta">beta data</span> : null}
          </div>
        </div>
      </div>
      <div className="why">{data.rationale}</div>

      {!compact && (
        <div className="evidence">
          {data.evidence.map((e, i) => (
            <div className="ev" key={i}>
              <div className="l">{e.label}</div>
              <div className={`v ${e.tone === "up" ? "up" : e.tone === "down" ? "down" : ""}`}>{e.value}</div>
            </div>
          ))}
        </div>
      )}
      {compact && (
        <div className="why" style={{ margin: "0 0 10px" }}>
          Proposed <b>{formatMoney(data.proposedPrice)}</b>
          {data.quantity > 1 ? ` ×${data.quantity}` : ""} → net after fees{" "}
          <b className={data.netAfterFees >= 0 ? "up" : "down"}>{formatMoney(data.netAfterFees)}</b>
        </div>
      )}

      {error ? (
        <div className="hint" style={{ color: "var(--bad)", marginBottom: 8 }}>
          {error}
        </div>
      ) : null}

      <div className="acts">
        <button className="btn good sm" onClick={doApprove} disabled={pending || expired} title={data.execDescription}>
          {expired ? "Expired" : `Approve — ${data.execLabel.toLowerCase()}`}
        </button>
        <button className="btn ghost sm" onClick={doDecline} disabled={pending || expired}>
          Decline
        </button>
        <span className="expire" aria-label={`Expires in ${formatCountdown(data.expiresAt, now)}`}>
          ⏳ {formatCountdown(data.expiresAt, now)}
        </span>
      </div>
      <div className="meter" aria-hidden="true">
        <i style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );
}
