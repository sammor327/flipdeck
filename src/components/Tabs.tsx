"use client";

import { useState, type ReactNode } from "react";

export function Tabs({
  tabs,
  initial = 0,
}: {
  tabs: { key: string; label: string; count?: number; content: ReactNode }[];
  initial?: number;
}) {
  const [active, setActive] = useState(initial);
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Alerts sections">
        {tabs.map((t, i) => (
          <button key={t.key} className={`tab ${i === active ? "on" : ""}`} role="tab" aria-selected={i === active} onClick={() => setActive(i)}>
            {t.label}
            {t.count != null ? <span className="n">{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }} role="tabpanel">
        {tabs[active].content}
      </div>
    </>
  );
}
