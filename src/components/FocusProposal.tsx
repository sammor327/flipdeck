"use client";

import { useEffect } from "react";

/** Scrolls to and briefly highlights the proposal referenced by a notification
 * deep link (/alerts?proposal=…). */
export function FocusProposal({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(`p-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "box-shadow .3s ease";
    el.style.boxShadow = "0 0 0 2px var(--accent)";
    const t = setTimeout(() => {
      el.style.boxShadow = "";
    }, 2500);
    return () => clearTimeout(t);
  }, [id]);
  return null;
}
