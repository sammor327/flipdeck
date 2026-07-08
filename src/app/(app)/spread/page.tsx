import { CardTable } from "@/components/CardTable";
import { EmptyState } from "@/components/states";
import { requireUser } from "@/lib/auth";
import { getSpreadRows } from "@/lib/queries";

export default async function SpreadScannerPage() {
  const user = await requireUser();
  const rows = await getSpreadRows(user.id);

  return (
    <>
      <h1>Spread Scanner</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        The flipper&apos;s front page: every tracked card where buy-here/sell-there beats your fees. Filter by game, sort any
        column. Sold prices are the truth — confirm liquidity before you chase a spread.
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="⇄" title="No spreads yet" hint="Track more cards (inventory + watchlist) and refresh prices to populate cross-market spreads." />
      ) : (
        <>
          <CardTable
            rows={rows}
            columns={["card", "game", "price", "spreadRoute", "spread", "liquidity", "action"]}
            initialSort="spread"
            initialDir={-1}
            emptyText="No spreads for this game."
            actionLabel="View"
          />
          <div className="hint" style={{ marginTop: 10 }}>
            *Spread = best cross-marketplace buy→sell gap after your fee &amp; shipping profiles (tune them in Settings).
          </div>
        </>
      )}
    </>
  );
}
