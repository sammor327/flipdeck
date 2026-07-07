import Link from "next/link";
import { Delta } from "@/components/Delta";
import { GameChip } from "@/components/GameChip";
import { WatchButton } from "@/components/WatchButton";
import { EmptyState } from "@/components/states";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";

export default async function WatchlistPage() {
  const user = (await getCurrentUser())!;
  const items = await prisma.watchlistItem.findMany({
    where: { userId: user.id },
    include: { card: { include: { game: true, marketStat: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <h1>Watchlist</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        Cards you don&apos;t own yet, with target buy/sell prices. Alert rules scoped to your watchlist watch these.
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="☆"
          title="Your watchlist is empty"
          hint="Add target prices from any card page — a Dip-buyer rule will propose a buy when one hits your target."
          action={
            <Link className="btn pri" href="/inventory">
              Browse cards
            </Link>
          }
        />
      ) : (
        <div className="panel" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Game</th>
                  <th className="num">Market</th>
                  <th className="num">24h</th>
                  <th className="num">Target buy</th>
                  <th className="num">Target sell</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const price = it.card.marketStat?.currentPrice ?? null;
                  const atBuy = it.targetBuyPrice != null && price != null && price <= it.targetBuyPrice;
                  return (
                    <tr key={it.id}>
                      <td>
                        <Link href={`/cards/${it.cardId}`}>
                          <div className="cname">{it.card.name}</div>
                          <div className="cset">
                            {it.card.setCode} · {it.card.rarity}
                          </div>
                        </Link>
                      </td>
                      <td>
                        <GameChip slug={it.card.game.slug} showBeta={false} />
                      </td>
                      <td className="num">{price != null ? formatMoney(price) : "—"}</td>
                      <td className="num">
                        <Delta value={it.card.marketStat?.delta24hPct} kind="percent" />
                      </td>
                      <td className="num">
                        {it.targetBuyPrice != null ? (
                          <span className={atBuy ? "up" : ""}>
                            {formatMoney(it.targetBuyPrice)}
                            {atBuy ? " ✓" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{it.targetSellPrice != null ? formatMoney(it.targetSellPrice) : "—"}</td>
                      <td className="cset" style={{ maxWidth: 220, whiteSpace: "normal" }}>
                        {it.notes ?? ""}
                      </td>
                      <td className="num">
                        <WatchButton cardId={it.cardId} initialWatched />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
