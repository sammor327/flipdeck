import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fastLaneCardIds } from "@/lib/fastLane";
import { formatRelativeTime } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  // expiresAt is authoritative: a pending row past its expiry is not actionable
  // even if the worker sweep hasn't flipped it yet.
  const now = new Date();
  const [approvals, latest, fastLaneSet] = await Promise.all([
    prisma.tradeProposal.count({ where: { userId: user.id, status: "pending", expiresAt: { gt: now } } }),
    prisma.pricePoint.findFirst({ orderBy: { capturedAt: "desc" }, select: { capturedAt: true } }),
    fastLaneCardIds(user.id),
  ]);

  const fastLaneCards = fastLaneSet.size;
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
