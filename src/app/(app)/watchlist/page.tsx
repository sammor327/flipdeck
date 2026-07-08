import Link from "next/link";
import { CardTable } from "@/components/CardTable";
import { EmptyState } from "@/components/states";
import { requireUser } from "@/lib/auth";
import { getWatchlistRows } from "@/lib/queries";

export default async function WatchlistPage() {
  const user = await requireUser();
  const rows = await getWatchlistRows(user.id);

  return (
    <>
      <h1>Watchlist</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        Cards you&apos;re tracking, with target buy/sell prices. Click a target cell to set or change it — FlipDeck
        proposes a buy when the price hits your target (and a sell once you own copies).
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="☆"
          title="Your watchlist is empty"
          hint="Watch cards from any card page, then set target prices here — FlipDeck proposes a buy when the price hits your target."
          action={
            <Link className="btn pri" href="/movers">
              Browse top movers
            </Link>
          }
        />
      ) : (
        <CardTable
          rows={rows}
          columns={["card", "game", "price", "delta24h", "targetBuy", "targetSell", "notes", "watch"]}
          initialSort="delta24h"
          initialDir={-1}
          emptyText="No watchlist cards match this game."
          editableTargets
        />
      )}
    </>
  );
}
