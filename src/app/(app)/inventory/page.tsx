import { InventoryTable, type CatalogEntry } from "@/components/InventoryTable";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mergeFeeProfiles } from "@/lib/feeProfiles";
import { formatMoney } from "@/lib/format";
import { getInventoryRows } from "@/lib/queries";

export default async function InventoryPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser();
  const [{ rows, summary }, cards, settings] = await Promise.all([
    getInventoryRows(user.id),
    prisma.card.findMany({ include: { game: true }, orderBy: { name: "asc" } }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
  ]);
  const feeProfiles = mergeFeeProfiles(settings?.feeProfiles);

  const catalog: CatalogEntry[] = cards.map((c) => ({
    id: c.id,
    name: c.name,
    setName: c.setName,
    setCode: c.setCode,
    gameSlug: c.game.slug,
  }));

  return (
    <>
      <div className="headrow" style={{ marginBottom: 16 }}>
        <div>
          <h1>Inventory</h1>
          <div className="sub">
            {summary.quantity} copies · {summary.distinctCards} distinct cards
          </div>
        </div>
      </div>

      <div className="strip" style={{ marginBottom: 16 }}>
        <div className="cell">
          <div className="lbl">Market value</div>
          <div className="val">{formatMoney(summary.marketValue)}</div>
        </div>
        <div className="cell">
          <div className="lbl">Cost basis</div>
          <div className="val">{formatMoney(summary.costBasis)}</div>
        </div>
        <div className="cell">
          <div className="lbl">Unrealized P/L</div>
          <div className={`val ${summary.unrealizedPL >= 0 ? "up" : "down"}`}>
            {formatMoney(summary.unrealizedPL)}
            {summary.unrealizedPct != null ? ` (${summary.unrealizedPct >= 0 ? "+" : "−"}${Math.abs(summary.unrealizedPct).toFixed(1)}%)` : ""}
          </div>
        </div>
        <div className="cell">
          <div className="lbl">Listed for sale</div>
          <div className="val">
            {summary.listedCount} cards · {formatMoney(summary.listedValue)}
          </div>
        </div>
        <div className="cell">
          <div className="lbl">Realized P/L</div>
          <div className={`val ${summary.realizedPL >= 0 ? "up" : "down"}`}>{formatMoney(summary.realizedPL)}</div>
        </div>
      </div>

      <InventoryTable rows={rows} catalog={catalog} initialQuery={searchParams.q ?? ""} feeProfiles={feeProfiles} />
    </>
  );
}
