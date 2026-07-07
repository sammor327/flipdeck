// Pure formatting + accessibility helpers. No React, so usable from server code,
// client components, and tests alike.
//
// Accessibility rule (from the brief): deltas are NEVER communicated by color
// alone. Every delta is rendered as a signed number plus a direction arrow, and
// exposes a spoken-word aria label. These helpers make that the path of least
// resistance.

export type Direction = "up" | "down" | "flat";

const MINUS = "−"; // real minus sign, matches the mockups (−)

export function directionOf(n: number | null | undefined, eps = 1e-6): Direction {
  if (n == null || Number.isNaN(n)) return "flat";
  if (n > eps) return "up";
  if (n < -eps) return "down";
  return "flat";
}

export function arrow(dir: Direction): string {
  return dir === "up" ? "▲" : dir === "down" ? "▼" : "→";
}

export function formatMoney(
  n: number,
  currency = "USD",
  opts: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {}
): string {
  // Guard the Intl invariant min <= max: if a caller drops max below the default
  // minimum (e.g. maximumFractionDigits:0), pull min down to match.
  const max = opts.maximumFractionDigits ?? 2;
  const min = opts.minimumFractionDigits ?? Math.min(2, max);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(n);
}

/** Compact form for hero numbers: $12,847 → "$12.8k". */
export function formatMoneyCompact(n: number, currency = "USD"): string {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(n);
  }
  return formatMoney(n, currency, { maximumFractionDigits: 0 });
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

/** "+$3.30" / "−$3.30" (real minus). Sign is always shown. */
export function formatSignedMoney(n: number, currency = "USD"): string {
  const sign = n > 0 ? "+" : n < 0 ? MINUS : "";
  return `${sign}${formatMoney(Math.abs(n), currency)}`;
}

/** "+3.3%" / "−3.3%". Sign always shown. */
export function formatSignedPercent(n: number, digits = 1): string {
  const sign = n > 0 ? "+" : n < 0 ? MINUS : "";
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

/**
 * A fully-formed delta string: "▲ +3.3%" / "▼ −$13.80". Arrow + sign together
 * so meaning survives with color stripped.
 */
export function formatDelta(
  n: number,
  kind: "percent" | "money",
  currency = "USD",
  digits = 1
): string {
  const dir = directionOf(n);
  const body = kind === "percent" ? formatSignedPercent(n, digits) : formatSignedMoney(n, currency);
  return `${arrow(dir)} ${body}`;
}

/** Screen-reader phrasing, e.g. "up 3.3 percent" / "down 13.80 dollars". */
export function deltaAria(n: number, kind: "percent" | "money"): string {
  const dir = directionOf(n);
  const word = dir === "up" ? "up" : dir === "down" ? "down" : "unchanged";
  const magnitude =
    kind === "percent" ? `${Math.abs(n).toFixed(1)} percent` : `${Math.abs(n).toFixed(2)} dollars`;
  return dir === "flat" ? "unchanged" : `${word} ${magnitude}`;
}

export function formatRelativeTime(from: Date | number, now: Date | number = Date.now()): string {
  const fromMs = typeof from === "number" ? from : from.getTime();
  const nowMs = typeof now === "number" ? now : now.getTime();
  const secs = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** Countdown "mm:ss" for proposal expiry meters. Clamps at 00:00. */
export function formatCountdown(untilMs: number, nowMs: number = Date.now()): string {
  const remaining = Math.max(0, Math.floor((untilMs - nowMs) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
