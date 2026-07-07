import Link from "next/link";
import { Delta } from "@/components/Delta";
import { GameChip } from "@/components/GameChip";
import { EmptyState } from "@/components/states";
import { marketplaceById } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { trackedCardIds } from "@/lib/queries";

export default async function SpreadScannerPage() {
  const user = (await getCurrentUser())!;
  const cardIds = await trackedCardIds(user.id);
  const stats = await prisma.marketStat.findMany({
    where: { cardId: { in: cardIds }, bestSpreadPct: { not: null } },
    include: { card: { include: { game: true } } },
  });
  stats.sort((a, b) => (b.bestSpreadPct ?? 0) - (a.bestSpreadPct ?? 0));

  return (
    <>
      <h1>Spread Scanner</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        The flipper&apos;s front page: every tracked card where buy-here/sell-there beats your fees. Sold prices are the truth —
        confirm liquidity before you chase a spread.
      </div>

      {stats.length === 0 ? (
        <EmptyState icon="⇄" title="No spreads yet" hint="Track more cards (inventory + watchlist) and refresh prices to populate cross-market spreads." />
      ) : (
        <div className="panel" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Game</th>
                  <th className="num">Price</th>
                  <th>Buy → Sell</th>
                  <th className="num">Spread after fees</th>
                  <th className="num">Liquidity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.cardId}>
                    <td>
                      <Link href={`/cards/${s.cardId}`}>
                        <div className="cname">{s.card.name}</div>
                        <div className="cset">
                          {s.card.setCode} · {s.card.rarity}
                        </div>
                      </Link>
                    </td>
                    <td>
                      <GameChip slug={s.card.game.slug} showBeta={false} />
                    </td>
                    <td className="num">{formatMoney(s.currentPrice)}</td>
                    <td className="cset">
                      {s.bestSpreadBuy ? marketplaceById(s.bestSpreadBuy)?.name : "—"} →{" "}
                      {s.bestSpreadSell ? marketplaceById(s.bestSpreadSell)?.name : "—"}
                    </td>
                    <td className="num">
                      <Delta value={s.bestSpreadPct} kind="percent" />
                    </td>
                    <td className="num">{s.liquidityScore ?? "—"}/100</td>
                    <td className="num">
                      <Link className="btn sm ghost" href={`/cards/${s.cardId}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
