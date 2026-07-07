"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRule, toggleRule } from "@/app/actions/alerts";

export function RuleRow({
  rule,
}: {
  rule: { id: string; name: string; desc: string; enabled: boolean; statLine: string; statTone?: "up" | "down" };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [pending, startTransition] = useTransition();

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
        <button className="btn sm ghost" onClick={del} disabled={pending}>
          Delete
        </button>
      </div>
    </div>
  );
}
