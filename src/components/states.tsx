import type { ReactNode } from "react";

export function EmptyState({
  icon = "◍",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">
        {icon}
      </div>
      <div style={{ color: "var(--ink-2)", fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {hint ? <div className="hint" style={{ maxWidth: 420, margin: "0 auto" }}>{hint}</div> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

/** Row of shimmer bars for loading tables. */
export function SkeletonRows({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="skeleton" style={{ height: 18 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
