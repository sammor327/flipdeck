// Pure sold-history analytics for the /analytics page. No I/O — the page maps
// Prisma rows to FlipInput and everything here is unit-tested (analytics.test.ts).
//
// Qualifying-flip rule: a row counts only when realizedPLFor() returns a number
// (legacy sales with no recorded price are excluded, matching summarize()) AND
// soldAt is present. Rows missing soldAt are excluded from EVERY figure —
// totals, win rate, hold time, per-game and the series alike — so all numbers
// on the page describe the same set of flips rather than subtly different ones.

import { DAY_MS, round2 } from "./math";
import { realizedPLFor } from "./queries";

export interface FlipInput {
  soldPrice: number | null;
  soldFees: number | null;
  costBasis: number; // per-unit acquisition cost
  quantity: number;
  soldAt: number | null; // epoch ms
  acquiredAt: number; // epoch ms
  cardName: string;
  gameSlug: string;
  gameName: string;
}

export interface FlipHighlight {
  cardName: string;
  gameName: string;
  realized: number;
  holdDays: number; // 1dp
}

export interface GameBreakdown {
  gameSlug: string;
  gameName: string;
  flips: number;
  realized: number;
  winRate: number; // percent, 1dp
}

export interface SeriesPoint {
  t: number; // soldAt, epoch ms
  cum: number; // cumulative realized P/L through this sale
}

export interface FlipAnalytics {
  flips: number;
  totalRealized: number;
  wins: number;
  losses: number;
  winRate: number | null; // percent, 1dp; null when 0 flips
  avgHoldDays: number | null; // 1dp; null when 0 flips
  best: FlipHighlight | null;
  worst: FlipHighlight | null;
  byGame: GameBreakdown[]; // sorted by realized desc
  series: SeriesPoint[]; // sorted by soldAt asc
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

interface Flip {
  realized: number;
  holdDays: number;
  soldAt: number;
  cardName: string;
  gameSlug: string;
  gameName: string;
}

function toHighlight(f: Flip): FlipHighlight {
  return { cardName: f.cardName, gameName: f.gameName, realized: f.realized, holdDays: round1(f.holdDays) };
}

export function computeAnalytics(rows: FlipInput[]): FlipAnalytics {
  const flips: Flip[] = [];
  for (const r of rows) {
    const realized = realizedPLFor(r.soldPrice, r.soldFees, r.costBasis, r.quantity);
    if (realized == null || r.soldAt == null) continue;
    flips.push({
      realized,
      holdDays: (r.soldAt - r.acquiredAt) / DAY_MS,
      soldAt: r.soldAt,
      cardName: r.cardName,
      gameSlug: r.gameSlug,
      gameName: r.gameName,
    });
  }

  if (flips.length === 0) {
    return { flips: 0, totalRealized: 0, wins: 0, losses: 0, winRate: null, avgHoldDays: null, best: null, worst: null, byGame: [], series: [] };
  }

  // Break-even (realized === 0) counts as a win: no money was lost on the flip.
  const wins = flips.filter((f) => f.realized >= 0).length;
  const losses = flips.length - wins;
  const totalRealized = round2(flips.reduce((sum, f) => sum + f.realized, 0));
  const winRate = round1((wins / flips.length) * 100);
  const avgHoldDays = round1(flips.reduce((sum, f) => sum + f.holdDays, 0) / flips.length);

  let best = flips[0];
  let worst = flips[0];
  for (const f of flips) {
    if (f.realized > best.realized) best = f;
    if (f.realized < worst.realized) worst = f;
  }

  const perGame = new Map<string, { gameSlug: string; gameName: string; flips: number; realized: number; wins: number }>();
  for (const f of flips) {
    const g =
      perGame.get(f.gameSlug) ??
      perGame.set(f.gameSlug, { gameSlug: f.gameSlug, gameName: f.gameName, flips: 0, realized: 0, wins: 0 }).get(f.gameSlug)!;
    g.flips += 1;
    g.realized += f.realized;
    if (f.realized >= 0) g.wins += 1;
  }
  const byGame: GameBreakdown[] = [...perGame.values()]
    .map((g) => ({
      gameSlug: g.gameSlug,
      gameName: g.gameName,
      flips: g.flips,
      realized: round2(g.realized),
      winRate: round1((g.wins / g.flips) * 100),
    }))
    .sort((a, b) => b.realized - a.realized);

  let cum = 0;
  const series: SeriesPoint[] = [...flips]
    .sort((a, b) => a.soldAt - b.soldAt)
    .map((f) => {
      cum += f.realized;
      return { t: f.soldAt, cum: round2(cum) };
    });

  return {
    flips: flips.length,
    totalRealized,
    wins,
    losses,
    winRate,
    avgHoldDays,
    best: toHighlight(best),
    worst: toHighlight(worst),
    byGame,
    series,
  };
}
