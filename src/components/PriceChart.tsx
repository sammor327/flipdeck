"use client";

import { useMemo, useRef, useState } from "react";
import { formatMoney, formatMoneyCompact } from "@/lib/format";

export interface ChartPoint {
  t: number; // epoch ms
  v: number; // value
}

const RANGES: { key: string; days: number }[] = [
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "1Y", days: 365 },
];

/**
 * Single-axis line/area chart with range switching and a hover crosshair —
 * powers both the dashboard portfolio chart and the card-detail history chart.
 * Kept single-axis per the design brief.
 */
export function PriceChart({
  series,
  defaultRange = "1M",
  height = 220,
  compact = false,
  ariaLabel = "price history",
}: {
  series: ChartPoint[];
  defaultRange?: string;
  height?: number;
  /** Compact y-axis labels ($12.8k) vs. full ($12,847.00). Serializable so this
   * component can be rendered from a Server Component. */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const formatValue = compact ? (n: number) => formatMoneyCompact(n) : (n: number) => formatMoney(n);
  const [range, setRange] = useState(defaultRange);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 680;
  const H = height;
  const padL = 44;
  const padR = 8;
  const padT = 20;
  const padB = 28;

  const data = useMemo(() => {
    if (series.length === 0) return [];
    const sorted = [...series].sort((a, b) => a.t - b.t);
    const last = sorted[sorted.length - 1].t;
    const days = RANGES.find((r) => r.key === range)?.days ?? 30;
    const cutoff = last - days * 24 * 3600 * 1000;
    const filtered = sorted.filter((p) => p.t >= cutoff);
    return filtered.length >= 2 ? filtered : sorted.slice(-2);
  }, [series, range]);

  const geom = useMemo(() => {
    if (data.length < 2) return null;
    const min = Math.min(...data.map((d) => d.v));
    const max = Math.max(...data.map((d) => d.v));
    const range01 = max - min || 1;
    const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
    const y = (v: number) => padT + (1 - (v - min) / range01) * (H - padT - padB);
    const pts = data.map((d, i) => [x(i), y(d.v)] as const);
    const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - padB} L${pts[0][0].toFixed(1)},${H - padB} Z`;
    return { min, max, pts, line, area };
  }, [data]);

  if (!geom) {
    return <div className="empty">Not enough price history yet.</div>;
  }

  const gridYs = [0, 0.33, 0.66, 1].map((f) => padT + f * (H - padT - padB));
  const yVals = [geom.max, geom.max - (geom.max - geom.min) / 3, geom.min + (geom.max - geom.min) / 3, geom.min];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    geom.pts.forEach(([px], i) => {
      const d = Math.abs(px - mx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover != null ? geom.pts[hover] : null;
  const hd = hover != null ? data[hover] : null;

  return (
    <div>
      <div className="phead" style={{ marginBottom: 10 }}>
        <div className="hint">Single-axis · hover for detail</div>
        <div className="ranges" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={`range ${range === r.key ? "on" : ""}`}
              onClick={() => setRange(r.key)}
              role="tab"
              aria-selected={range === r.key}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={ariaLabel}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ display: "block" }}
        >
          <g stroke="#2c2c2a" strokeWidth="1">
            {gridYs.map((gy, i) => (
              <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} />
            ))}
          </g>
          <g fill="#898781" fontSize="11">
            {gridYs.map((gy, i) => (
              <text key={i} x={padL - 6} y={gy + 4} textAnchor="end">
                {formatValue(yVals[i])}
              </text>
            ))}
          </g>
          <path d={geom.area} fill="var(--accent)" opacity="0.1" />
          <path d={geom.line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={geom.pts[geom.pts.length - 1][0]} cy={geom.pts[geom.pts.length - 1][1]} r="4" fill="var(--accent)" stroke="#1a1a19" strokeWidth="2" />
          {hp && (
            <>
              <line x1={hp[0]} y1={padT} x2={hp[0]} y2={H - padB} stroke="#898781" strokeWidth="1" />
              <circle cx={hp[0]} cy={hp[1]} r="4" fill="var(--accent)" stroke="#1a1a19" strokeWidth="2" />
            </>
          )}
        </svg>
        {hp && hd && (
          <div
            style={{
              position: "absolute",
              left: `min(${(hp[0] / W) * 100}%, calc(100% - 130px))`,
              top: `${(hp[1] / H) * 100}%`,
              transform: "translateY(-120%)",
              pointerEvents: "none",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "7px 10px",
              fontSize: 12,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
            }}
          >
            <b style={{ display: "block" }}>{formatValue(hd.v)}</b>
            <span className="hint">{new Date(hd.t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
