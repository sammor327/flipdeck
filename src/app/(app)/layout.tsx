import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRelativeTime } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const [approvals, latest, invDistinct, watchCount, rulesEnabled] = await Promise.all([
    prisma.tradeProposal.count({ where: { userId: user.id, status: "pending" } }),
    prisma.pricePoint.findFirst({ orderBy: { capturedAt: "desc" }, select: { capturedAt: true } }),
    prisma.inventoryItem.findMany({
      where: { portfolio: { userId: user.id }, status: { in: ["owned", "listed"] } },
      select: { cardId: true },
      distinct: ["cardId"],
    }),
    prisma.watchlistItem.count({ where: { userId: user.id } }),
    prisma.alertRule.count({ where: { userId: user.id, enabled: true } }),
  ]);

  const fastLaneCards = rulesEnabled > 0 ? invDistinct.length + watchCount : 0;
  const freshness = latest?.capturedAt ? formatRelativeTime(latest.capturedAt) : "never";

  return (
    <div className="app-shell">
      <Sidebar approvals={approvals} freshness={freshness} fastLaneCards={fastLaneCards} />
      <main className="main">
        <TopBar user={{ name: user.name, email: user.email }} />
        {children}
      </main>
    </div>
  );
}
