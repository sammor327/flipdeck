import { ApprovalCard } from "@/components/ApprovalCard";
import { Delta } from "@/components/Delta";
import { FocusProposal } from "@/components/FocusProposal";
import { NewRuleForm } from "@/components/NewRuleForm";
import { RuleRow } from "@/components/RuleRow";
import { Tabs } from "@/components/Tabs";
import { EmptyState } from "@/components/states";
import type { ProposeSide, RuleTrigger } from "@/lib/constants";
import type { RuleParams } from "@/lib/alerts/types";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import { fromJson } from "@/lib/json";
import { buildApprovalData } from "@/lib/proposalView";

function sideWord(proposeSide: ProposeSide): string {
  return proposeSide === "auto" ? "trade" : proposeSide;
}

function describeRule(trigger: RuleTrigger, params: RuleParams, proposeSide: ProposeSide): string {
  const side = sideWord(proposeSide);
  switch (trigger) {
    case "threshold_above":
      return `Price ▲ above ${formatMoney(params.threshold ?? 0)} → propose ${side}`;
    case "threshold_below":
      return `Price ▼ below ${formatMoney(params.threshold ?? 0)} → propose ${side}`;
    case "pct_move": {
      const arrow = params.direction === "down" ? "▼" : params.direction === "up" ? "▲" : "▲▼";
      return `${arrow} >${params.movePct ?? 0}% / ${params.windowHours ?? 24}h → propose ${side}`;
    }
    case "spread":
      return `Cross-market spread ≥${params.spreadPct ?? 0}% after fees → propose ${side}`;
    case "new_low":
      return `New ${params.lookbackDays ?? 90}-day low → propose ${side}`;
    default:
      return "Custom rule";
  }
}

const feedIcon = (kind: string, actedOn: boolean): string => {
  if (kind === "expiry") return "✕";
  if (kind === "hindsight") return "↓";
  if (kind === "info") return "🔔";
  return actedOn ? "✓" : "⚡";
};

export default async function AlertsPage({ searchParams }: { searchParams: { proposal?: string } }) {
  const user = (await getCurrentUser())!;

  const [pending, notifications, rules, history, proposals30] = await Promise.all([
    // Past-expiry pending rows drop out of Approvals immediately; the worker
    // sweep (not this read-only page) flips them to expired with hindsight,
    // after which they surface in History.
    prisma.tradeProposal.findMany({
      where: { userId: user.id, status: "pending", expiresAt: { gt: new Date() } },
      include: { card: { include: { game: true } } },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.notificationLog.findMany({ where: { userId: user.id }, orderBy: { sentAt: "desc" }, take: 20 }),
    prisma.alertRule.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.tradeProposal.findMany({
      where: { userId: user.id, status: { in: ["approved", "declined", "expired", "executed"] } },
      include: { card: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.tradeProposal.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
      select: { ruleId: true, status: true, side: true, netAfterFees: true, costBasis: true, quantity: true },
    }),
  ]);

  // Per-rule 30-day attribution.
  const attribution = new Map<string, { fired: number; realized: number }>();
  for (const p of proposals30) {
    if (!p.ruleId) continue;
    const a = attribution.get(p.ruleId) ?? { fired: 0, realized: 0 };
    a.fired++;
    if ((p.status === "approved" || p.status === "executed") && p.side === "sell") {
      a.realized += p.netAfterFees - (p.costBasis ?? 0) * p.quantity;
    }
    attribution.set(p.ruleId, a);
  }

  const approvals = pending.map((p) =>
    buildApprovalData(p, {
      name: p.card.name,
      setName: p.card.setName,
      setCode: p.card.setCode,
      gameSlug: p.card.game.slug,
      gameName: p.card.game.name,
      dataQuality: p.card.game.dataQuality,
      imageUrl: p.card.imageUrl,
    })
  );

  const ruleRows = rules.map((r) => {
    const attr = attribution.get(r.id) ?? { fired: 0, realized: 0 };
    const realized = Math.round(attr.realized);
    return {
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      desc: describeRule(r.trigger as RuleTrigger, fromJson<RuleParams>(r.params, {}), r.proposeSide as ProposeSide),
      statLine: `${attr.fired}× · 30d`,
      realizedLine: realized !== 0 ? `${realized >= 0 ? "+" : "−"}$${Math.abs(realized)} realized` : "",
      statTone: realized > 0 ? ("up" as const) : realized < 0 ? ("down" as const) : undefined,
    };
  });

  const approvalsList =
    approvals.length === 0 ? (
      <EmptyState icon="✅" title="No approvals waiting" hint="When a rule fires with a trade action, its proposal shows up here for one-tap approval." />
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {searchParams.proposal ? <FocusProposal id={searchParams.proposal} /> : null}
        {approvals.map((a) => (
          <div key={a.id} id={`p-${a.id}`}>
            <ApprovalCard data={a} />
          </div>
        ))}
      </div>
    );

  const feedList = (
    <div className="panel">
      <h2>Latest notifications</h2>
      <div className="hint" style={{ marginBottom: 8 }}>
        Everything pushed to your devices, with hindsight once proposals close.
      </div>
      {notifications.length === 0 ? (
        <div className="hint" style={{ padding: 12 }}>
          No notifications yet.
        </div>
      ) : (
        <ul className="feed">
          {notifications.map((n) => (
            <li key={n.id}>
              <span className="fic" aria-hidden="true">
                {feedIcon(n.kind, n.actedOn)}
              </span>
              <div className="ft">
                {n.title}
                <div className="t">
                  {formatRelativeTime(n.sentAt)} · {n.deliveredAt ? "delivered" : "held (quiet hours)"}
                  {n.actedOn ? " · acted on" : ""}
                </div>
                {n.kind === "expiry" || n.kind === "hindsight" ? <div className="hind">{n.body}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const rulesList = (
    <div className="panel">
      <h2>My rules</h2>
      <div className="hint" style={{ marginBottom: 8 }}>
        Rule-level attribution: which rules actually make you money.
      </div>
      {ruleRows.length === 0 ? (
        <div className="hint" style={{ padding: 12 }}>
          No rules yet. Create one below or from any card page.
        </div>
      ) : (
        ruleRows.map((r) => (
          <RuleRow
            key={r.id}
            rule={{
              id: r.id,
              name: r.name,
              enabled: r.enabled,
              desc: r.desc,
              statLine: r.realizedLine ? `${r.statLine} · ${r.realizedLine}` : r.statLine,
              statTone: r.statTone,
            }}
          />
        ))
      )}
      <NewRuleForm />
    </div>
  );

  const historyList = (
    <div className="panel">
      <h2>History</h2>
      <div className="hint" style={{ marginBottom: 8 }}>
        Closed proposals with hindsight on what the price did next.
      </div>
      {history.length === 0 ? (
        <div className="hint" style={{ padding: 12 }}>
          No closed proposals yet.
        </div>
      ) : (
        <ul className="feed">
          {history.map((p) => (
            <li key={p.id}>
              <span className="fic" aria-hidden="true">
                {p.status === "approved" || p.status === "executed" ? "✓" : p.status === "declined" ? "↓" : "✕"}
              </span>
              <div className="ft">
                <b style={{ textTransform: "capitalize" }}>{p.status}</b> — {p.card.name} {p.side} at {formatMoney(p.proposedPrice)}
                <div className="t">
                  {formatRelativeTime(p.createdAt)}
                  {(p.status === "approved" || p.status === "executed") && p.deepLink ? (
                    <>
                      {" · "}
                      <a href={p.deepLink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                        Open listing ↗
                      </a>
                    </>
                  ) : null}
                </div>
                {p.outcomeNote ? <div className="hind">{p.outcomeNote}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <h1>Alerts &amp; Approvals</h1>
      <div className="sub" style={{ marginBottom: 16 }}>
        Push notifications land here too — approve from your phone or this screen, whichever you reach first.
      </div>

      <Tabs
        tabs={[
          {
            key: "approvals",
            label: "Approvals",
            count: approvals.length,
            content: (
              <div className="cols" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, alignItems: "start" }}>
                <div>{approvalsList}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {feedList}
                  {rulesList}
                </div>
              </div>
            ),
          },
          { key: "feed", label: "Notification feed", content: feedList },
          { key: "rules", label: "My rules", count: rules.length, content: rulesList },
          { key: "history", label: "History", content: historyList },
        ]}
      />
    </>
  );
}
