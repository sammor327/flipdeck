"use client";

import { useEffect } from "react";

/** Registers the Web Push service worker. Push subscription itself is opt-in
 * from Settings, so this only registers the SW (safe, no permission prompt). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort; app works without it */
    });
  }, []);
  return null;
}
