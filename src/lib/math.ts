// Pure price math: deltas over windows, volatility, gross spread, liquidity.
// No I/O — everything here is unit-tested (see math.test.ts). Fee-adjusted
// arithmetic lives in fees.ts; this module is fee-agnostic.

export interface PricePointLite {
  price: number;
  capturedAt: Date;
  marketplace?: string;
  condition?: string;
  listingCount?: number | null;
}

export const HOUR_MS = 3600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Signed percentage change from `from` to `to`. Returns null if `from` <= 0. */
export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

/** Ascending sort helper (does not mutate the input). */
export function sortByTime<T extends { capturedAt: Date }>(series: T[]): T[] {
  return [...series].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
}

/**
 * Price as of time `t`: the most recent observation at or before `t`. Falls back
 * to the earliest observation if `t` precedes the whole series. Assumes `series`
 * is sorted ascending by capturedAt.
 */
export function priceAsOf(series: PricePointLite[], t: Date): number | null {
  if (series.length === 0) return null;
  let chosen: number | null = null;
  for (const p of series) {
    if (p.capturedAt.getTime() <= t.getTime()) chosen = p.price;
    else break;
  }
  return chosen ?? series[0].price;
}

export function latestPrice(series: PricePointLite[]): number | null {
  if (series.length === 0) return null;
  return series[series.length - 1].price;
}

/**
 * Signed % move over a trailing window ending at `now` (default: latest point's
 * time). Compares the price `windowMs` ago against the latest price.
 */
export function moveOverWindow(
  series: PricePointLite[],
  windowMs: number,
  now?: Date
): number | null {
  if (series.length === 0) return null;
  const sorted = series;
  const end = now ?? sorted[sorted.length - 1].capturedAt;
  const latest = priceAsOf(sorted, end);
  const past = priceAsOf(sorted, new Date(end.getTime() - windowMs));
  if (latest == null || past == null) return null;
  return pctChange(past, latest);
}

export interface Deltas {
  delta24hPct: number | null;
  delta7dPct: number | null;
  delta30dPct: number | null;
}

/** Convenience rollup of the three windows the UI shows. */
export function computeDeltas(series: PricePointLite[], now?: Date): Deltas {
  const sorted = sortByTime(series);
  return {
    delta24hPct: moveOverWindow(sorted, DAY_MS, now),
    delta7dPct: moveOverWindow(sorted, 7 * DAY_MS, now),
    delta30dPct: moveOverWindow(sorted, 30 * DAY_MS, now),
  };
}

/** Collapse an intraday series into one close per calendar day (UTC), ascending. */
export function toDailyCloses(series: PricePointLite[], lookbackDays?: number, now?: Date): number[] {
  const sorted = sortByTime(series);
  const byDay = new Map<string, number>();
  for (const p of sorted) {
    const key = p.capturedAt.toISOString().slice(0, 10);
    byDay.set(key, p.price); // last write wins → the day's close
  }
  let entries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (lookbackDays != null) {
    const cutoff = (now ?? (sorted.length ? sorted[sorted.length - 1].capturedAt : new Date())).getTime() -
      lookbackDays * DAY_MS;
    entries = entries.filter(([day]) => new Date(day + "T00:00:00Z").getTime() >= cutoff);
  }
  return entries.map(([, v]) => v);
}

/** Simple day-over-day returns (as fractions) from a list of daily closes. */
export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

/** Sample standard deviation of a list. Returns 0 for < 2 samples. */
export function stddev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Annualization-free volatility: stdev of daily returns over the window,
 * expressed as a percentage. Higher = choppier.
 */
export function volatilityPct(series: PricePointLite[], lookbackDays = 30, now?: Date): number {
  const closes = toDailyCloses(series, lookbackDays, now);
  return stddev(dailyReturns(closes)) * 100;
}

export function minOver(series: PricePointLite[], lookbackDays: number, now?: Date): number | null {
  const sorted = sortByTime(series);
  if (sorted.length === 0) return null;
  const end = now ?? sorted[sorted.length - 1].capturedAt;
  const cutoff = end.getTime() - lookbackDays * DAY_MS;
  const inWindow = sorted.filter((p) => p.capturedAt.getTime() >= cutoff);
  const pool = inWindow.length ? inWindow : sorted;
  return Math.min(...pool.map((p) => p.price));
}

export function maxOver(series: PricePointLite[], lookbackDays: number, now?: Date): number | null {
  const sorted = sortByTime(series);
  if (sorted.length === 0) return null;
  const end = now ?? sorted[sorted.length - 1].capturedAt;
  const cutoff = end.getTime() - lookbackDays * DAY_MS;
  const inWindow = sorted.filter((p) => p.capturedAt.getTime() >= cutoff);
  const pool = inWindow.length ? inWindow : sorted;
  return Math.max(...pool.map((p) => p.price));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Gross (fee-free) cross-marketplace spread %: (sell − buy) / buy × 100. */
export function grossSpreadPct(buyPrice: number, sellPrice: number): number | null {
  return pctChange(buyPrice, sellPrice);
}

/**
 * Liquidity score 0–100 blending listing depth and sales velocity. Deterministic
 * so it's testable. 1000+ listings and 15+ sales/day each saturate their term.
 */
export function liquidityScore(listingCount: number | null | undefined, salesPerDay = 0): number {
  const listings = Math.max(0, listingCount ?? 0);
  const depth = Math.min(1, Math.log10(listings + 1) / 3); // log10(1000)=3
  const velocity = Math.min(1, Math.max(0, salesPerDay) / 15);
  return clamp(Math.round((0.5 * depth + 0.5 * velocity) * 100), 0, 100);
}

/**
 * Estimate sales/day from the drop in listing count between consecutive points
 * (a listing disappearing ≈ a sale). Only counts decreases. A coarse but honest
 * signal per TECH_NOTES.
 */
export function estimateSalesPerDay(series: PricePointLite[], lookbackDays = 7, now?: Date): number {
  const sorted = sortByTime(series).filter((p) => p.listingCount != null);
  if (sorted.length < 2) return 0;
  const end = now ?? sorted[sorted.length - 1].capturedAt;
  const cutoff = end.getTime() - lookbackDays * DAY_MS;
  const win = sorted.filter((p) => p.capturedAt.getTime() >= cutoff);
  if (win.length < 2) return 0;
  let sold = 0;
  for (let i = 1; i < win.length; i++) {
    const drop = (win[i - 1].listingCount ?? 0) - (win[i].listingCount ?? 0);
    if (drop > 0) sold += drop;
  }
  const spanDays = Math.max(1, (win[win.length - 1].capturedAt.getTime() - win[0].capturedAt.getTime()) / DAY_MS);
  return sold / spanDays;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
