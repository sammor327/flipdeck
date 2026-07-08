"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { simulateTick } from "@/app/actions/worker";
import { InlineStatus, useActionStatus } from "./ActionStatus";

/**
 * Dev convenience: run one ingest tick on demand so you can watch prices move,
 * rules fire, and proposals appear without leaving a worker running. In
 * production this is the scheduled worker's job.
 */
export function RefreshPrices() {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const { status, flash } = useActionStatus();
  const router = useRouter();

  const run = () => {
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await simulateTick();
        if (res.ok) {
          flash("ok", `+${res.quotesInserted} quotes · ${res.proposalsCreated} proposal(s)`);
          router.refresh();
        } else {
          flash("error", res.error ?? "Refresh failed");
        }
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <>
      <button className="btn ghost sm" onClick={run} disabled={pending || busy} title="Run one price-ingest tick now">
        {pending || busy ? "Refreshing…" : "↻ Refresh prices"}
      </button>{" "}
      <InlineStatus status={status} />
    </>
  );
}
