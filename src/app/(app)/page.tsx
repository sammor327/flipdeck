import Link from "next/link";
import { ApprovalCard } from "@/components/ApprovalCard";
import { CardArt } from "@/components/CardArt";
import { Delta } from "@/components/Delta";
import { GameChip } from "@/components/GameChip";
import { PriceChart } from "@/components/PriceChart";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState } from "@/components/states";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCountdown, formatMoney } from "@/lib/format";
import { HEADLINE_TAG_META, HEADLINES } from "@/lib/headlines";
import { pctChange } from "@/lib/math";
import { buildApprovalData } from "@/lib/proposalView";
import { getDashboardStats, getPortfolioSeries, getTopMovers, getInventoryRows } from "@/lib/queries";
import { daysUntil, RELEASE_TYPE_META, RELEASES, relativeDay } from "@/lib/releases";

function valueDaysAgo(series: { t: number; v: number }[], days: number): number | null {
  if (series.length === 0) return null;
  const target = series[series.length - 1].t - days * 24 * 3600 * 1000;
  let chosen: number | null = null;
  for (const p of series) {
    if (p.t <= target) chosen = p.v;
  }
  return chosen ?? series[0].v;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const [{ summary }, series, stats, movers] = await Promise.all([
    getInventoryRows(user.id),
    getPortfolioSeries(user.id),
    getDashboardStats(user.id),
    getTopMovers(user.id, 6),
  ]);

  // Past-expiry pending rows drop out of Approvals immediately; the worker
  // sweep (not this read-only page) flips them to expired with hindsight.
  // Matching this filter to getDashboardStats keeps the panel, the "View all"
  // count, and the "Pending approvals" tile in agreement.
  const pending = await prisma.tradeProposal.findMany({
    where: { userId: user.id, status: "pending", expiresAt: { gt: new Date() } },
    include: { card: { include: { game: true } } },
    orderBy: { expiresAt: "asc" },
  });
  const approvals = pending.map((p) =>
    buildApprovalData(p, {
      name: p.card.name,
      setName: p.card.setName,
      setCode: p.card.setCode,
      gameSlug: p.card.game.slug,
      gameName: p.card.game.name,
      dataQuality: p.card.game.dataQuality,
      imageUrl: p.card.imageUrl,
    })
  );

  const marketValue = summary.marketValue;
  const weekAgo = valueDaysAgo(series, 7) ?? marketValue;
  const week$ = marketValue - weekAgo;
  const weekPct = pctChange(weekAgo, marketValue);
  const sparkPts = series.slice(-14).map((p) => p.v);

  const hasHoldings = summary.quantity > 0;

  const nextReleases = [...RELEASES].filter((r) => daysUntil(r.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const topHeadlines = [...HEADLINES].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  return (
    <>
      <h1>
        {greeting()}, {user.name ?? "there"}
      </h1>
      <div className="sub" style={{ marginBottom: 20 }}>
        {hasHoldings ? (
          <>
            Your portfolio moved <Delta value={week$} kind="money" /> in the last 7 days.{" "}
          </>
        ) : (
          <>Add some cards to start tracking your flips. </>
        )}
        {stats.pending > 0 ? `${stats.pending} approval${stats.pending === 1 ? "" : "s"} waiting.` : "No approvals waiting."}
      </div>

      {/* Stat tiles */}
      <div className="tiles" style={{ marginBottom: 18 }}>
        <div className="tile">
          <div className="lbl">Portfolio value</div>
          <div className="val hero">{formatMoney(marketValue, "USD", { maximumFractionDigits: 0 })}</div>
          <div className="delta">
            <Delta value={week$} kind="money" /> (<Delta value={weekPct} kind="percent" />){" "}
            <span className="vs">vs last week</span>
          </div>
          {sparkPts.length > 1 ? (
            <div style={{ marginTop: 8 }}>
              <Sparkline points={sparkPts} width={150} height={30} label="portfolio 14-day trend" />
            </div>
          ) : null}
        </div>
        <div className="tile">
          <div className="lbl">Unrealized P/L</div>
          <div className={`val ${summary.unrealizedPL >= 0 ? "up" : "down"}`}>{formatMoney(summary.unrealizedPL)}</div>
          <div className="delta">
            <span className="vs">
              across {summary.distinctCards} cards · cost basis {formatMoney(summary.costBasis)}
            </span>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">Active alert rules</div>
          <div className="val">{stats.activeRules}</div>
          <div className="delta">
            <span className="vs">
              fired {stats.firedThisWeek}× this week · {stats.actedThisWeek} acted on
            </span>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">Pending approvals</div>
          <div className="val">{stats.pending}</div>
          <div className="delta">
            <span className="vs">
              {stats.soonestExpiry ? `soonest expires in ${formatCountdown(stats.soonestExpiry.getTime())}` : "none pending"}
            </span>
          </div>
        </div>
      </div>

      <div className="cols" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, alignItems: "start" }}>
        {/* Portfolio chart */}
        <div className="panel">
          <div className="phead">
            <div>
              <h2>Portfolio value</h2>
              <div className="hint">Marked to market from your default marketplaces</div>
            </div>
          </div>
          {series.length > 1 ? (
            <PriceChart series={series} defaultRange="1M" ariaLabel="Portfolio value over time" compact />
          ) : (
            <EmptyState icon="📈" title="No history yet" hint="Add holdings and refresh prices to build your portfolio curve." />
          )}
        </div>

        {/* Pending approvals */}
        <div className="panel">
          <h2>Pending approvals</h2>
          <div className="hint" style={{ marginBottom: 12 }}>
            One tap. 5-second undo. Proposals expire as prices move.
          </div>
          {approvals.length === 0 ? (
            <EmptyState icon="✅" title="All clear" hint="Fired rules will queue one-tap trade proposals here." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {approvals.slice(0, 2).map((a) => (
                <ApprovalCard key={a.id} data={a} compact />
              ))}
              <Link className="nav" href="/alerts" style={{ justifyContent: "center", color: "var(--accent)", fontSize: 13 }}>
                View all {approvals.length} approval{approvals.length === 1 ? "" : "s"} →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Top movers */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="phead">
          <div>
            <h2>Top movers — your tracked cards</h2>
            <div className="hint">Across watchlist + inventory · last 24 hours</div>
          </div>
          <Link className="btn ghost sm" href="/spread">
            Open spread scanner ⇄
          </Link>
        </div>
        {movers.length === 0 ? (
          <EmptyState icon="🃏" title="Nothing tracked yet" hint="Cards in your inventory and watchlist show up here." action={<Link className="btn pri" href="/inventory">Add cards</Link>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Game</th>
                  <th className="num">Price</th>
                  <th className="num">24h</th>
                  <th style={{ textAlign: "center" }}>7d trend</th>
                  <th className="num">Spread*</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {movers.map((m) => (
                  <tr key={m.cardId}>
                    <td>
                      <Link href={`/cards/${m.cardId}`} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <CardArt name={m.name} gameSlug={m.gameSlug} setCode={m.setName} rarity={m.rarity} imageUrl={m.imageUrl} size="thumb" />
                        <span>
                          <span className="cname" style={{ display: "block" }}>
                            {m.name}
                          </span>
                          <span className="cset">
                            {m.setName} · {m.rarity}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <GameChip slug={m.gameSlug} showBeta={false} />
                    </td>
                    <td className="num">{formatMoney(m.price)}</td>
                    <td className="num">
                      <Delta value={m.delta24hPct} kind="percent" />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <Sparkline points={m.spark} width={110} height={26} label={`${m.name} 7-day trend`} />
                    </td>
                    <td className="num">
                      <Delta value={m.bestSpreadPct} kind="percent" />
                    </td>
                    <td className="num">
                      <Link className={`btn sm ${m.owned ? "pri" : "good"}`} href={`/cards/${m.cardId}`}>
                        {m.owned ? "Sell" : "Buy dip"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint" style={{ marginTop: 10 }}>
          *Spread = best cross-marketplace buy→sell gap after your fee profile. Full math on each card page.
        </div>
      </div>

      {/* Releases & community headlines */}
      <div className="cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        <div className="panel">
          <div className="phead">
            <div>
              <h2>Next releases</h2>
              <div className="hint">When the market shifts &amp; cards leave rotation</div>
            </div>
            <Link className="btn ghost sm" href="/releases">
              All →
            </Link>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
            {nextReleases.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--grid)" }}>
                <span className="fic" aria-hidden="true">
                  {RELEASE_TYPE_META[r.type].icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                  <div className="hint">{RELEASE_TYPE_META[r.type].label}</div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", color: daysUntil(r.date) <= 14 ? "var(--warn)" : "var(--ink-2)" }}>
                  {relativeDay(r.date)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="phead">
            <div>
              <h2>Community headlines</h2>
              <div className="hint">Why prices are moving</div>
            </div>
            <Link className="btn ghost sm" href="/releases">
              More →
            </Link>
          </div>
          <ul className="feed" style={{ marginTop: 6 }}>
            {topHeadlines.map((h) => (
              <li key={h.id}>
                <span className="fic" aria-hidden="true">
                  {HEADLINE_TAG_META[h.tag].icon}
                </span>
                <div className="ft">
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{h.title}</div>
                  <div className="t">
                    {h.source} · {relativeDay(h.date)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
