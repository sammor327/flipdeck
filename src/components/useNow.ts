"use client";

import { useEffect, useState } from "react";

/** Ticking clock hook for countdowns/meters. Returns Date.now() every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
