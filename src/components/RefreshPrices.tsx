"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { simulateTick } from "@/app/actions/worker";

/**
 * Dev convenience: run one ingest tick on demand so you can watch prices move,
 * rules fire, and proposals appear without leaving a worker running. In
 * production this is the scheduled worker's job.
 */
export function RefreshPrices() {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const run = () => {
    setBusy(true);
    startTransition(async () => {
      try {
        await simulateTick();
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <button className="btn ghost sm" onClick={run} disabled={pending || busy} title="Run one price-ingest tick now">
      {pending || busy ? "Refreshing…" : "↻ Refresh prices"}
    </button>
  );
}
