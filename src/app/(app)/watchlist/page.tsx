import Link from "next/link";
import { CardTable } from "@/components/CardTable";
import { EmptyState } from "@/components/states";
import { getCurrentUser } from "@/lib/auth";
import { getWatchlistRows } from "@/lib/queries";

export default async function WatchlistPage() {
  const user = (await getCurrentUser())!;
  const rows = await getWatchlistRows(user.id);

  return (
    <>
      <h1>Watchlist</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        Cards you don&apos;t own yet, with target buy/sell prices. Filter by game and sort any column. Dip-buyer rules watch these.
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="☆"
          title="Your watchlist is empty"
          hint="Add target prices from any card page — a Dip-buyer rule will propose a buy when one hits your target."
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
        />
      )}
    </>
  );
}
