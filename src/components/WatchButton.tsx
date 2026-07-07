"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWatch, removeWatch } from "@/app/actions/watchlist";

export function WatchButton({ cardId, initialWatched }: { cardId: string; initialWatched: boolean }) {
  const router = useRouter();
  const [watched, setWatched] = useState(initialWatched);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      if (watched) {
        await removeWatch(cardId);
        setWatched(false);
      } else {
        await addWatch(cardId);
        setWatched(true);
      }
      router.refresh();
    });

  return (
    <button className={`btn ${watched ? "" : "ghost"}`} onClick={toggle} disabled={pending} aria-pressed={watched}>
      {watched ? "★ Watching" : "☆ Watch"}
    </button>
  );
}
