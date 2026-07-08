"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ActionStatusValue {
  kind: "ok" | "error";
  text: string;
}

/** How long a success flash stays visible before auto-clearing. */
export const OK_TTL_MS = 2500;

type TimerRef = { current: ReturnType<typeof setTimeout> | null };

/**
 * Core flash behaviour, extracted so it can be unit-tested without rendering:
 * set the new status, drop any pending auto-clear, and schedule one only for
 * successes — errors persist until the next action replaces them.
 */
export function applyFlash(
  kind: "ok" | "error",
  text: string,
  setStatus: (s: ActionStatusValue | null) => void,
  timer: TimerRef,
  ttlMs: number = OK_TTL_MS
) {
  if (timer.current != null) {
    clearTimeout(timer.current);
    timer.current = null;
  }
  setStatus({ kind, text });
  if (kind === "ok") {
    timer.current = setTimeout(() => {
      timer.current = null;
      setStatus(null);
    }, ttlMs);
  }
}

/**
 * Inline feedback for server-action results. `flash("ok", …)` shows a transient
 * success (auto-clears after ~2.5s); `flash("error", …)` persists until the next
 * flash/clear. Render the returned status with <InlineStatus>.
 */
export function useActionStatus() {
  const [status, setStatus] = useState<ActionStatusValue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current);
    },
    []
  );

  const flash = useCallback((kind: "ok" | "error", text: string) => applyFlash(kind, text, setStatus, timer), []);
  const clear = useCallback(() => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setStatus(null);
  }, []);

  return { status, flash, clear };
}

/**
 * Small inline status text. Always rendered (empty when idle) so the aria-live
 * region exists before content changes and screen readers announce updates.
 */
export function InlineStatus({ status }: { status: ActionStatusValue | null }) {
  return (
    <span
      role="status"
      aria-live="polite"
      style={{ fontSize: 12, color: status?.kind === "ok" ? "var(--good)" : "var(--bad)" }}
    >
      {status?.text}
    </span>
  );
}
