import Link from "next/link";
import { notFound } from "next/navigation";
import { CardArt } from "@/components/CardArt";
import { Delta } from "@/components/Delta";
import { GameChip } from "@/components/GameChip";
import { PriceChart } from "@/components/PriceChart";
import { RuleBuilder } from "@/components/RuleBuilder";
import { WatchButton } from "@/components/WatchButton";
import {
  CONDITION_MULTIPLIER,
  marketplaceById,
  MARKETPLACES,
  type Condition,
  type GameSlug,
  type Marketplace,
} from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildDeepLink } from "@/lib/execution";
import { mergeFeeProfiles } from "@/lib/feeProfiles";
import { bestSpread, netProceeds, toUsd, type MarketQuote } from "@/lib/fees";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import { round2 } from "@/lib/math";
import { SPREAD_FRESHNESS_MS } from "@/lib/stats";

export default async function CardDetailPage({ params }: { params: { id: string } }) {
  const user = (await getCurrentUser())!;
  const card = await prisma.card.findUnique({ where: { id: params.id }, include: { game: true, marketStat: true } });
  if (!card) notFound();

  const [historyRows, latestRows, holdings, watch, settings] = await Promise.all([
    prisma.pricePoint.findMany({
      where: { cardId: card.id, marketplace: "tcgplayer", condition: "NM", priceType: "market" },
      orderBy: { capturedAt: "asc" },
      select: { price: true, capturedAt: true },
    }),
    prisma.pricePoint.findMany({ where: { cardId: card.id, condition: "NM" }, orderBy: { capturedAt: "desc" } }),
    prisma.inventoryItem.findMany({ where: { portfolio: { userId: user.id }, cardId: card.id, status: { in: ["owned", "listed"] } } }),
    prisma.watchlistItem.findFirst({ where: { userId: user.id, cardId: card.id } }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
  ]);

  const profiles = mergeFeeProfiles(settings?.feeProfiles);

  const series = historyRows.map((r) => ({ t: r.capturedAt.getTime(), v: r.price }));

  // Latest point per (marketplace, priceType) at NM.
  const latest = new Map<string, (typeof latestRows)[number]>();
  for (const p of latestRows) {
    const key = `${p.marketplace}:${p.priceType}`;
    if (!latest.has(key)) latest.set(key, p);
  }

  const marketplaceRows = MARKETPLACES.map((m) => {
    const market = latest.get(`${m.id}:market`);
    const low = latest.get(`${m.id}:low`);
    const sold = latest.get(`${m.id}:sold`);
    const primary = market ?? sold;
    if (!primary) return null;
    const netIfSold = market ? netProceeds(toUsd(market.price, market.currency), 1, profiles[m.id]).net : null;
    return {
      id: m.id,
      name: m.name,
      currency: primary.currency,
      low: low?.price ?? null,
      market: market?.price ?? null,
      sold: sold?.price ?? null,
      listings: primary.listingCount ?? null,
      netIfSold,
      capturedAt: primary.capturedAt,
    };
  }).filter(Boolean) as {
    id: Marketplace;
    name: string;
    currency: string;
    low: number | null;
    market: number | null;
    sold: number | null;
    listings: number | null;
    netIfSold: number | null;
    capturedAt: Date;
  }[];

  // Stale quotes still show in the price table below, but they can't feed the
  // spread panel — a weeks-old capture pairing with a live quote fabricates arbitrage.
  const nowMs = Date.now();
  const quotes: MarketQuote[] = marketplaceRows
    .filter((r) => nowMs - r.capturedAt.getTime() <= SPREAD_FRESHNESS_MS)
    .map((r) => (r.market ?? r.sold ? { marketplace: r.id, price: (r.market ?? r.sold)!, currency: r.currency } : null))
    .filter(Boolean) as MarketQuote[];
  const spread = bestSpread(quotes, profiles);

  const owned = holdings.reduce((s, h) => s + h.quantity, 0);
  const avgCost = owned > 0 ? round2(holdings.reduce((s, h) => s + h.costBasis * h.quantity, 0) / owned) : null;
  const conditionOwned = (holdings[0]?.condition as Condition) ?? "NM";
  const price = card.marketStat?.currentPrice ?? 0;
  const freshness = latest.get("tcgplayer:market")?.capturedAt
    ? formatRelativeTime(latest.get("tcgplayer:market")!.capturedAt)
    : "—";
  const estNet = netProceeds(price, Math.max(1, owned), profiles.tcgplayer).net;

  const sellLink = buildDeepLink("tcgplayer", "sell", { name: card.name, setName: card.setName, setCode: card.setCode, gameSlug: card.game.slug as GameSlug });
  const buyLink = buildDeepLink("tcgplayer", "buy", { name: card.name, setName: card.setName, setCode: card.setCode, gameSlug: card.game.slug as GameSlug });

  return (
    <>
      <div className="crumb" style={{ marginBottom: 14 }}>
        <Link href="/inventory">Inventory</Link> / {card.game.name} / <b>{card.name}</b>
      </div>

      <div className="hero" style={{ display: "grid", gridTemplateColumns: "190px 1fr 300px", gap: 18, marginBottom: 14, alignItems: "start" }}>
        <CardArt name={card.name} gameSlug={card.game.slug} setCode={card.setCode} rarity={card.rarity} imageUrl={card.imageUrl} size="full" />

        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>{card.name}</h1>
          <div className="hint" style={{ fontSize: 13, marginBottom: 12 }}>
            {card.setName} · {card.rarity} · #{card.collectorNumber} · {card.finish} · {card.language}
          </div>
          <span style={{ marginRight: 6 }}>
            <GameChip slug={card.game.slug} />
          </span>
          {owned > 0 ? <span className="chip" style={{ marginRight: 6 }}>You own {owned} · {conditionOwned}</span> : null}
          {avgCost != null ? <span className="chip">Cost basis {formatMoney(avgCost)}</span> : null}

          <div style={{ fontSize: 36, fontWeight: 600, marginTop: 14 }}>
            {formatMoney(price)} <span className="hint" style={{ fontSize: 14 }}>TCGplayer Market · NM · {freshness}</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>
            <Delta value={card.marketStat?.delta24hPct} kind="percent" /> (24h) &nbsp;·&nbsp;{" "}
            <Delta value={card.marketStat?.delta7dPct} kind="percent" /> (7d) &nbsp;·&nbsp;{" "}
            <span className="hint">
              liquidity: {card.marketStat?.liquidityScore ?? "—"}/100 ({card.marketStat?.listingCount ?? 0} listings)
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {owned > 0 ? (
              <a className="btn pri" href={sellLink} target="_blank" rel="noopener noreferrer">
                Sell mine — est. net {formatMoney(estNet)}
              </a>
            ) : null}
            <a className="btn good" href={buyLink} target="_blank" rel="noopener noreferrer">
              Buy more
            </a>
            <a className="btn ghost" href="#rulebuilder">
              + Alert rule
            </a>
            <WatchButton cardId={card.id} initialWatched={Boolean(watch)} />
          </div>
        </div>

        {/* Spread panel */}
        <div className="spread">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: "var(--good)", marginBottom: 8 }}>BEST SPREAD RIGHT NOW</div>
          {spread ? (
            <>
              <div className="sline">
                <span>
                  Buy — {marketplaceById(spread.buyMarketplace)?.name}, NM
                </span>
                <b>{formatMoney(spread.buyPrice)}</b>
              </div>
              <div className="sline">
                <span>Sell — {marketplaceById(spread.sellMarketplace)?.name}, NM</span>
                <b>{formatMoney(spread.sellPrice)}</b>
              </div>
              <div className="sline">
                <span>Fees + shipping (your profile)</span>
                <b>−{formatMoney(spread.fees)}</b>
              </div>
              <div className="sline total">
                <span>
                  <b>Net per copy</b>
                </span>
                <span>
                  <Delta value={spread.netPerCopy} kind="money" /> (<Delta value={spread.netPct} kind="percent" />)
                </span>
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                {spread.netPct >= 8 ? "Above your 8% floor — executable." : "Thin — below your 8% floor. Set a spread alert to catch a better window."}
              </div>
            </>
          ) : (
            <div className="hint">Not enough cross-marketplace data for a spread.</div>
          )}
        </div>
      </div>

      <div className="cols" style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 14, alignItems: "start", marginBottom: 14 }}>
        <div className="panel">
          <div className="phead">
            <div>
              <h2>Price history — NM, TCGplayer Market</h2>
              <div className="hint">Listing price is the ask; sold price is the truth.</div>
            </div>
          </div>
          {series.length > 1 ? (
            <PriceChart series={series} defaultRange="1M" ariaLabel={`${card.name} price history`} />
          ) : (
            <div className="empty">No price history yet.</div>
          )}
        </div>

        <div id="rulebuilder">
          <RuleBuilder cardId={card.id} cardName={card.name} currentPrice={price} />
        </div>
      </div>

      <div className="panel">
        <h2>Marketplace prices — NM unless noted</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Net = after your fee &amp; shipping profile (tune it in Settings).
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Marketplace</th>
                <th className="num">Lowest listing</th>
                <th className="num">Market price</th>
                <th className="num">Last sold</th>
                <th className="num">Listings</th>
                <th className="num">Your net if sold</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {marketplaceRows.map((r) => (
                <tr key={r.id}>
                  <td className="cname">
                    {r.name} {r.currency !== "USD" ? <span className="hint">({r.currency})</span> : null}
                  </td>
                  <td className="num">{r.low != null ? formatMoney(r.low, r.currency) : "—"}</td>
                  <td className="num">{r.market != null ? formatMoney(r.market, r.currency) : "—"}</td>
                  <td className="num">{r.sold != null ? formatMoney(r.sold, r.currency) : "—"}</td>
                  <td className="num">{r.listings ?? "—"}</td>
                  <td className="num">{r.netIfSold != null ? formatMoney(r.netIfSold) : "—"}</td>
                  <td className="num">
                    <a
                      className="btn sm ghost"
                      href={buildDeepLink(r.id, "sell", { name: card.name, setName: card.setName, setCode: card.setCode, gameSlug: card.game.slug as GameSlug })}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
