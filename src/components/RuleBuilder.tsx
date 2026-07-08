"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuleTrigger } from "@/lib/constants";
import { RULE_TRIGGER_LABELS } from "@/lib/constants";
import { backtestRule, createRule, type CreateRuleInput } from "@/app/actions/alerts";

export function RuleBuilder({ cardId, cardName, currentPrice }: { cardId: string; cardName: string; currentPrice: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [trigger, setTrigger] = useState<RuleTrigger>("threshold_above");
  const [threshold, setThreshold] = useState<number>(Math.round(currentPrice));
  const [windowHours, setWindowHours] = useState(24);
  const [movePct, setMovePct] = useState(15);
  const [direction, setDirection] = useState<"up" | "down" | "either">("up");
  const [spreadPct, setSpreadPct] = useState(8);
  const [lookbackDays, setLookbackDays] = useState(90);
  const [thenChoice, setThenChoice] = useState("sell");
  const [expiry, setExpiry] = useState(30);
  const [cooldown, setCooldown] = useState(360);
  const [quiet, setQuiet] = useState(true);
  const [backtest, setBacktest] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = (): CreateRuleInput => ({
    name: `${RULE_TRIGGER_LABELS[trigger].replace("…", "")} — ${cardName}`.slice(0, 60),
    scope: "card",
    cardId,
    trigger,
    threshold,
    windowHours,
    movePct,
    direction,
    spreadPct,
    lookbackDays,
    action: thenChoice === "notify" ? "notify" : "propose_trade",
    proposeSide: thenChoice === "buy" ? "buy" : thenChoice === "sell" ? "sell" : "auto",
    proposalExpiryMinutes: expiry,
    cooldownMinutes: cooldown,
    quietHoursRespected: quiet,
  });

  const onCreate = () =>
    startTransition(async () => {
      setError(null);
      const res = await createRule(input());
      if (!res.ok) {
        setError(res.error ?? "Couldn't create rule");
        return;
      }
      setDone(true);
      router.refresh();
      setTimeout(() => setDone(false), 2500);
    });

  const onBacktest = () =>
    startTransition(async () => {
      const res = await backtestRule(input());
      setBacktest(res.note);
    });

  return (
    <div className="panel">
      <h2>Alert rule for this card</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        Fires a push notification; can also propose a one-tap trade.
      </div>

      <label className="hint">When</label>
      <select
        value={trigger}
        onChange={(e) => {
          setTrigger(e.target.value as RuleTrigger);
          setError(null);
        }}
        style={{ width: "100%", marginTop: 4 }}
      >
        {(Object.keys(RULE_TRIGGER_LABELS) as RuleTrigger[]).map((t) => (
          <option key={t} value={t}>
            {RULE_TRIGGER_LABELS[t]}
          </option>
        ))}
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        {(trigger === "threshold_above" || trigger === "threshold_below") && (
          <div>
            <label className="hint">Threshold ($)</label>
            <input type="number" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)} style={{ width: "100%" }} />
          </div>
        )}
        {trigger === "pct_move" && (
          <>
            <div>
              <label className="hint">Move ≥ (%)</label>
              <input type="number" value={movePct} onChange={(e) => setMovePct(parseFloat(e.target.value) || 0)} style={{ width: "100%" }} />
            </div>
            <div>
              <label className="hint">Window</label>
              <select value={windowHours} onChange={(e) => setWindowHours(parseInt(e.target.value))} style={{ width: "100%" }}>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={168}>7 days</option>
              </select>
            </div>
            <div>
              <label className="hint">Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value as "up" | "down" | "either")} style={{ width: "100%" }}>
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="either">Either</option>
              </select>
            </div>
          </>
        )}
        {trigger === "spread" && (
          <div>
            <label className="hint">Spread ≥ (%)</label>
            <input type="number" value={spreadPct} onChange={(e) => setSpreadPct(parseFloat(e.target.value) || 0)} style={{ width: "100%" }} />
          </div>
        )}
        {trigger === "new_low" && (
          <div>
            <label className="hint">Lookback (days)</label>
            <input type="number" value={lookbackDays} onChange={(e) => setLookbackDays(parseInt(e.target.value) || 90)} style={{ width: "100%" }} />
          </div>
        )}
      </div>

      <label className="hint" style={{ display: "block", marginTop: 12 }}>
        Then
      </label>
      <select value={thenChoice} onChange={(e) => setThenChoice(e.target.value)} style={{ width: "100%", marginTop: 4 }}>
        <option value="sell">Notify + propose SELL (one-tap approve)</option>
        <option value="notify">Notify only</option>
        <option value="buy">Notify + propose BUY</option>
      </select>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        <div>
          <label className="hint">Proposal expiry</label>
          <select value={expiry} onChange={(e) => setExpiry(parseInt(e.target.value))} style={{ width: "100%" }}>
            <option value={30}>30 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={120}>2 hours</option>
          </select>
        </div>
        <div>
          <label className="hint">Cooldown</label>
          <select value={cooldown} onChange={(e) => setCooldown(parseInt(e.target.value))} style={{ width: "100%" }}>
            <option value={360}>6 hours</option>
            <option value={60}>1 hour</option>
            <option value={1440}>24 hours</option>
          </select>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
        <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Respect quiet hours
      </label>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="btn pri" style={{ flex: 1 }} onClick={onCreate} disabled={pending}>
          {done ? "✓ Rule created" : "Create rule"}
        </button>
        <button className="btn ghost" onClick={onBacktest} disabled={pending}>
          Backtest
        </button>
      </div>
      {error ? (
        <div className="hint" style={{ marginTop: 10 }}>
          <span className="down" role="alert">
            {error}
          </span>
        </div>
      ) : null}
      {backtest ? (
        <div className="hint" style={{ marginTop: 10 }}>
          Backtest: {backtest}
        </div>
      ) : null}
    </div>
  );
}
