"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuleParams } from "@/lib/alerts/types";
import type { ProposeSide, RuleAction, RuleTrigger } from "@/lib/constants";
import { RULE_TRIGGER_LABELS } from "@/lib/constants";
import { deleteRule, toggleRule, updateRule, type CreateRuleInput } from "@/app/actions/alerts";

/** Reverse-map the stored action+proposeSide pair onto the form's single
 * "then" select. The "auto" option keeps the round-trip lossless for rules
 * created with proposeSide "auto". */
function thenChoiceFor(action: RuleAction, proposeSide: ProposeSide): string {
  if (action === "notify") return "notify";
  return proposeSide === "buy" ? "buy" : proposeSide === "sell" ? "sell" : "auto";
}

export function RuleRow({
  rule,
}: {
  rule: {
    id: string;
    name: string;
    desc: string;
    enabled: boolean;
    trigger: RuleTrigger;
    params: RuleParams;
    action: RuleAction;
    proposeSide: ProposeSide;
    statLine: string;
    statTone?: "up" | "down";
  };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rule.name);
  const [trigger, setTrigger] = useState<RuleTrigger>(rule.trigger);
  const [threshold, setThreshold] = useState(rule.params.threshold ?? 50);
  const [movePct, setMovePct] = useState(rule.params.movePct ?? 15);
  const [windowHours, setWindowHours] = useState(rule.params.windowHours ?? 24);
  const [direction, setDirection] = useState<"up" | "down" | "either">(rule.params.direction ?? "either");
  const [spreadPct, setSpreadPct] = useState(rule.params.spreadPct ?? 8);
  const [lookbackDays, setLookbackDays] = useState(rule.params.lookbackDays ?? 90);
  const [thenChoice, setThenChoice] = useState(thenChoiceFor(rule.action, rule.proposeSide));
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    startTransition(async () => {
      const res = await toggleRule(rule.id);
      if (res.ok) setEnabled(res.enabled ?? !enabled);
      router.refresh();
    });

  const del = () =>
    startTransition(async () => {
      await deleteRule(rule.id);
      router.refresh();
    });

  const openEdit = () => {
    // Re-prefill from the freshest props so a cancelled edit doesn't leak
    // stale field values (or a stale error) into the next one.
    setName(rule.name);
    setTrigger(rule.trigger);
    setThreshold(rule.params.threshold ?? 50);
    setMovePct(rule.params.movePct ?? 15);
    setWindowHours(rule.params.windowHours ?? 24);
    setDirection(rule.params.direction ?? "either");
    setSpreadPct(rule.params.spreadPct ?? 8);
    setLookbackDays(rule.params.lookbackDays ?? 90);
    setThenChoice(thenChoiceFor(rule.action, rule.proposeSide));
    setError(null);
    setEditing(true);
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      const input: CreateRuleInput = {
        name,
        // Placeholder: updateRule preserves the rule's stored scope/cardId,
        // so card-scoped rules stay card-scoped without exposing scope here.
        scope: "inventory",
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
      const res = await updateRule(rule.id, input);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save rule");
        return;
      }
      setEditing(false);
      router.refresh();
    });

  if (editing) {
    return (
      <div className="rule" style={{ display: "block" }}>
        <div className="phead" style={{ marginBottom: 10 }}>
          <div className="name">Edit rule</div>
          <button className="btn sm ghost" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </button>
        </div>
        <input placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
            <option value="auto">Propose (auto side)</option>
            <option value="notify">Notify only</option>
          </select>
        </div>
        <button className="btn pri" style={{ marginTop: 10, width: "100%" }} onClick={save} disabled={pending}>
          Save changes
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

  return (
    <div className="rule">
      <button
        className={`tk ${enabled ? "" : "off"}`}
        onClick={toggle}
        disabled={pending}
        aria-pressed={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} rule ${rule.name}`}
      />
      <div>
        <div className="name">
          {rule.name}
          {!enabled ? <span className="hint"> · paused</span> : null}
        </div>
        <div className="desc">{rule.desc}</div>
      </div>
      <div className="stat">
        <span className={rule.statTone === "up" ? "up" : rule.statTone === "down" ? "down" : ""}>{rule.statLine}</span>
        <br />
        <button className="btn sm ghost" onClick={openEdit} disabled={pending}>
          Edit
        </button>{" "}
        <button className="btn sm ghost" onClick={del} disabled={pending}>
          Delete
        </button>
      </div>
    </div>
  );
}
