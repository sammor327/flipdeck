import Link from "next/link";
import { CardArt } from "@/components/CardArt";
import { CardTable } from "@/components/CardTable";
import { Delta } from "@/components/Delta";
import { getCurrentUser } from "@/lib/auth";
import type { CardRow } from "@/lib/cardRow";
import { formatMoney } from "@/lib/format";
import { getMoverRows } from "@/lib/queries";

function MoverHighlight({ title, hint, cards }: { title: string; hint: string; cards: CardRow[] }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div className="hint" style={{ marginBottom: 6 }}>
        {hint}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {cards.length === 0 ? (
          <div className="hint" style={{ padding: 8 }}>
            No data yet.
          </div>
        ) : (
          cards.map((c) => (
            <Link
              key={c.cardId}
              href={`/cards/${c.cardId}`}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--grid)" }}
            >
              <CardArt name={c.name} gameSlug={c.gameSlug} setCode={c.setCode} rarity={c.rarity} imageUrl={c.imageUrl} size="thumb" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cname" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name}
                </div>
                <div className="cset">
                  {formatMoney(c.price ?? 0)} · {c.gameName}
                </div>
              </div>
              <Delta value={c.delta24hPct} kind="percent" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export default async function MoversPage() {
  const user = (await getCurrentUser())!;
  const allRows = await getMoverRows(user.id);
  const byMove = [...allRows].sort((a, b) => (b.delta24hPct ?? 0) - (a.delta24hPct ?? 0));
  const gainers = byMove.filter((r) => (r.delta24hPct ?? 0) > 0).slice(0, 4);
  const losers = byMove
    .filter((r) => (r.delta24hPct ?? 0) < 0)
    .slice(-4)
    .reverse();
  // The table shows the biggest absolute movers (not all 200 cards) — that's the point of "top movers".
  const TABLE_LIMIT = 60;
  const tableRows = [...allRows]
    .sort((a, b) => Math.abs(b.delta24hPct ?? 0) - Math.abs(a.delta24hPct ?? 0))
    .slice(0, TABLE_LIMIT);

  return (
    <>
      <h1>Top Movers</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        The {TABLE_LIMIT} biggest 24h moves across all {allRows.length} tracked printings. Filter by game, sort any column. Sold
        prices are the truth — confirm liquidity before chasing a move.
      </div>

      <div className="cols" style={{ gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <MoverHighlight title="Top gainers · 24h" hint="Momentum — candidates to sell into strength." cards={gainers} />
        <MoverHighlight title="Top losers · 24h" hint="Weakness — candidates to buy the dip." cards={losers} />
      </div>

      <CardTable
        rows={tableRows}
        columns={["card", "game", "price", "delta24h", "delta7d", "spark", "spread", "action"]}
        initialSort="delta24h"
        initialDir={-1}
        emptyText="No movers for this game."
        actionLabel="View"
      />
    </>
  );
}
