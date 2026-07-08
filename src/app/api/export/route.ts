import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { conditionMultiplier } from "@/lib/constants";
import { round2 } from "@/lib/math";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/export → the signed-in user's inventory as CSV.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const items = await prisma.inventoryItem.findMany({
    where: { portfolio: { userId: user.id } },
    include: { card: { include: { game: true, marketStat: true } } },
    orderBy: { createdAt: "desc" },
  });

  const header = ["name", "set", "game", "condition", "quantity", "cost_basis", "market_price", "status", "tags", "location"];
  const rows = items.map((it) => {
    const nm = it.card.marketStat?.currentPrice ?? null;
    const price = nm != null ? round2(nm * conditionMultiplier(it.condition)) : "";
    return [
      it.card.name,
      it.card.setCode,
      it.card.game.name,
      it.condition,
      it.quantity,
      it.costBasis,
      price,
      it.status,
      it.tags,
      it.location ?? "",
    ]
      .map(csvCell)
      .join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flipdeck-inventory.csv"`,
    },
  });
}
