/**
 * Tiny trend sparkline. Direction is encoded by the end-dot color AND is
 * redundant with the signed delta shown alongside it in every table, so no
 * color-only information is conveyed.
 */
export function Sparkline({
  points,
  width = 90,
  height = 24,
  label,
}: {
  points: number[];
  width?: number;
  height?: number;
  label?: string;
}) {
  if (!points || points.length < 2) {
    return <span className="hint">—</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p - min) / range) * (height - 6) - 3;
    return [x, y] as const;
  });
  const last = coords[coords.length - 1];
  const up = points[points.length - 1] >= points[0];
  const color = up ? "var(--good)" : "var(--bad)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "trend sparkline"}>
      <polyline
        points={coords.map((c) => c.join(",")).join(" ")}
        fill="none"
        stroke="#898781"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} stroke="#1a1a19" strokeWidth="2" />
    </svg>
  );
}
