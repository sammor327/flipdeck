"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuleScope, RuleTrigger } from "@/lib/constants";
import { RULE_TRIGGER_LABELS } from "@/lib/constants";
import { createRule, type CreateRuleInput } from "@/app/actions/alerts";

export function NewRuleForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<RuleScope>("inventory");
  const [trigger, setTrigger] = useState<RuleTrigger>("pct_move");
  const [threshold, setThreshold] = useState(50);
  const [movePct, setMovePct] = useState(15);
  const [windowHours, setWindowHours] = useState(24);
  const [direction, setDirection] = useState<"up" | "down" | "either">("up");
  const [spreadPct, setSpreadPct] = useState(8);
  const [lookbackDays, setLookbackDays] = useState(90);
  const [thenChoice, setThenChoice] = useState("sell");
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const input: CreateRuleInput = {
        name: name.trim() || "Untitled rule",
        scope,
        trigger,
        threshold,
        movePct,
        windowHours,
        direction,
        spreadPct,
        lookbackDays,
        action: thenChoice === "notify" ? "notify" : "propose_trade",
        proposeSide: thenChoice === "buy" ? "buy" : thenChoice === "sell" ? "sell" : "auto",
      };
      const res = await createRule(input);
      if (!res.ok) {
        setError(res.error ?? "Couldn't create rule");
        return;
      }
      setOpen(false);
      setName("");
      router.refresh();
    });

  if (!open) {
    return (
      <button
        className="btn ghost sm"
        style={{ marginTop: 12, width: "100%" }}
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        + New rule
      </button>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 12, background: "var(--surface-2)" }}>
      <div className="phead" style={{ marginBottom: 10 }}>
        <h2>New rule</h2>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <input placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <select value={scope} onChange={(e) => setScope(e.target.value as RuleScope)}>
          <option value="inventory">Whole inventory</option>
          <option value="watchlist">Watchlist</option>
        </select>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as RuleTrigger)}>
          {(Object.keys(RULE_TRIGGER_LABELS) as RuleTrigger[]).map((t) => (
            <option key={t} value={t}>
              {RULE_TRIGGER_LABELS[t]}
            </option>
          ))}
        </select>
        {(trigger === "threshold_above" || trigger === "threshold_below") && (
          <input type="number" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)} placeholder="Threshold $" />
        )}
        {trigger === "pct_move" && (
          <>
            <input type="number" value={movePct} onChange={(e) => setMovePct(parseFloat(e.target.value) || 0)} placeholder="Move %" />
            <select value={windowHours} onChange={(e) => setWindowHours(parseInt(e.target.value))}>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={168}>7 days</option>
            </select>
            <select value={direction} onChange={(e) => setDirection(e.target.value as "up" | "down" | "either")}>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="either">Either</option>
            </select>
          </>
        )}
        {trigger === "spread" && <input type="number" value={spreadPct} onChange={(e) => setSpreadPct(parseFloat(e.target.value) || 0)} placeholder="Spread %" />}
        {trigger === "new_low" && <input type="number" value={lookbackDays} onChange={(e) => setLookbackDays(parseInt(e.target.value) || 90)} placeholder="Lookback days" />}
        <select value={thenChoice} onChange={(e) => setThenChoice(e.target.value)}>
          <option value="sell">Propose SELL</option>
          <option value="buy">Propose BUY</option>
          <option value="notify">Notify only</option>
        </select>
      </div>
      <button className="btn pri" style={{ marginTop: 10, width: "100%" }} onClick={submit} disabled={pending}>
        Create rule
      </button>
      {error ? (
        <div className="hint" style={{ marginTop: 8 }}>
          <span className="down" role="alert">
            {error}
          </span>
        </div>
      ) : null}
    </div>
  );
}
