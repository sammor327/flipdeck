import Link from "next/link";
import { Delta } from "@/components/Delta";
import { GameChip } from "@/components/GameChip";
import { EmptyState } from "@/components/states";
import { computeAnalytics, type FlipInput, type SeriesPoint } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPercent, formatSignedMoney } from "@/lib/format";

/**
 * Cumulative realized P/L as a small static polyline — one point per sale, so
 * the interactive PriceChart (built for dense daily series) would be overkill.
 */
function CumulativeLine({ series }: { series: SeriesPoint[] }) {
  if (series.length < 2) {
    return <div className="hint">Record at least two sales to draw the curve.</div>;
  }
  const W = 680;
  const H = 150;
  const pad = 12;
  const minT = series[0].t;
  const spanT = series[series.length - 1].t - minT || 1;
  const vals = series.map((p) => p.cum);
  const minV = Math.min(0, ...vals);
  const spanV = Math.max(0, ...vals) - minV || 1;
  const x = (t: number) => pad + ((t - minT) / spanT) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - minV) / spanV) * (H - 2 * pad);
  const pts = series.map((p) => `${x(p.t).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  const label = `Cumulative realized profit and loss across ${series.length} sales, ending at ${formatSignedMoney(last.cum)}`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: "block" }}>
      <line x1={pad} y1={y(0)} x2={W - pad} y2={y(0)} stroke="#2c2c2a" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.t)} cy={y(last.cum)} r="4" fill="var(--accent)" stroke="#1a1a19" strokeWidth="2" />
    </svg>
  );
}

function FlipCallout({ title, hint, flip }: { title: string; hint: string; flip: { cardName: string; gameName: string; realized: number; holdDays: number } }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div className="hint" style={{ marginBottom: 8 }}>
        {hint}
      </div>
      <div className="cname">{flip.cardName}</div>
      <div className="cset" style={{ marginBottom: 6 }}>
        {flip.gameName} · held {flip.holdDays} days
      </div>
      <Delta value={flip.realized} kind="money" />
    </div>
  );
}

export default async function AnalyticsPage() {
  const user = await requireUser();
  const items = await prisma.inventoryItem.findMany({
    where: { portfolio: { userId: user.id }, status: "sold" },
    include: { card: { include: { game: true } } },
  });
  const inputs: FlipInput[] = items.map((it) => ({
    soldPrice: it.soldPrice,
    soldFees: it.soldFees,
    costBasis: it.costBasis,
    quantity: it.quantity,
    soldAt: it.soldAt ? it.soldAt.getTime() : null,
    acquiredAt: it.acquiredAt.getTime(),
    cardName: it.card.name,
    gameSlug: it.card.game.slug,
    gameName: it.card.game.name,
  }));
  const a = computeAnalytics(inputs);

  if (a.flips === 0) {
    return (
      <>
        <h1>Analytics</h1>
        <div className="sub" style={{ marginBottom: 18 }}>
          Realized P/L, win rate and hold times — built from your sold cards.
        </div>
        <EmptyState
          icon="◔"
          title="No recorded sales yet"
          hint="Analytics fills in once a sale has a recorded price and date."
          action={
            <Link className="btn pri" href="/inventory">
              Record your first sale from the inventory table
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <h1>Analytics</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        {a.flips} completed flip{a.flips === 1 ? "" : "s"} · sales without a recorded price or date are excluded from every
        figure here.
      </div>

      {/* Summary tiles */}
      <div className="tiles" style={{ marginBottom: 18 }}>
        <div className="tile">
          <div className="lbl">Realized P/L</div>
          <div className="val">
            <Delta value={a.totalRealized} kind="money" />
          </div>
          <div className="delta">
            <span className="vs">net of fees, all recorded sales</span>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">Win rate</div>
          <div className="val">{a.winRate != null ? formatPercent(a.winRate) : "—"}</div>
          <div className="delta">
            <span className="vs">
              {a.wins} win{a.wins === 1 ? "" : "s"} · {a.losses} loss{a.losses === 1 ? "" : "es"} · break-even counts as a win
            </span>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">Avg hold</div>
          <div className="val">{a.avgHoldDays != null ? `${a.avgHoldDays} days` : "—"}</div>
          <div className="delta">
            <span className="vs">acquisition → sale</span>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">Flips</div>
          <div className="val">{a.flips}</div>
          <div className="delta">
            <span className="vs">sold rows with price &amp; date</span>
          </div>
        </div>
      </div>

      {/* Best / worst callouts */}
      {a.best && a.worst ? (
        <div className="cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <FlipCallout title="Best flip" hint="Biggest realized gain — do more of this." flip={a.best} />
          <FlipCallout title="Worst flip" hint="Biggest realized loss — what went wrong?" flip={a.worst} />
        </div>
      ) : null}

      {/* Cumulative realized P/L */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="phead">
          <div>
            <h2>Cumulative realized P/L</h2>
            <div className="hint">Running total after each sale, in sale order</div>
          </div>
        </div>
        <CumulativeLine series={a.series} />
      </div>

      {/* Per-game breakdown */}
      <div className="panel">
        <div className="phead">
          <div>
            <h2>By game</h2>
            <div className="hint">Where your realized edge actually comes from</div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th className="num">Flips</th>
                <th className="num">Win rate</th>
                <th className="num">Realized P/L</th>
              </tr>
            </thead>
            <tbody>
              {a.byGame.map((g) => (
                <tr key={g.gameSlug}>
                  <td>
                    <GameChip slug={g.gameSlug} showBeta={false} />
                  </td>
                  <td className="num">{g.flips}</td>
                  <td className="num">{formatPercent(g.winRate)}</td>
                  <td className="num">
                    <Delta value={g.realized} kind="money" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          <Link href="/alerts" style={{ color: "var(--accent)" }}>
            Per-rule attribution → Alerts
          </Link>
        </div>
      </div>
    </>
  );
}
