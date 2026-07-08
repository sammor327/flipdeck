"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWatch, removeWatch } from "@/app/actions/watchlist";
import { InlineStatus, useActionStatus } from "./ActionStatus";

export function WatchButton({ cardId, initialWatched }: { cardId: string; initialWatched: boolean }) {
  const router = useRouter();
  const [watched, setWatched] = useState(initialWatched);
  const [pending, startTransition] = useTransition();
  const { status, flash, clear } = useActionStatus();

  const toggle = () =>
    startTransition(async () => {
      const res: { ok: boolean; error?: string } = watched ? await removeWatch(cardId) : await addWatch(cardId);
      if (!res.ok) {
        flash("error", res.error ?? (watched ? "Unwatch failed" : "Watch failed"));
        return; // leave watched/aria-pressed alone
      }
      clear();
      setWatched(!watched);
      router.refresh();
    });

  return (
    <>
      <button className={`btn ${watched ? "" : "ghost"}`} onClick={toggle} disabled={pending} aria-pressed={watched}>
        {watched ? "★ Watching" : "☆ Watch"}
      </button>{" "}
      <InlineStatus status={status} />
    </>
  );
}
