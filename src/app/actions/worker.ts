"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { runTick } from "@/lib/worker/tick";

/**
 * Run one ingest tick on demand (the "↻ Refresh prices" button). In production
 * the standalone worker (`npm run worker`) does this on a schedule. Requires a
 * signed-in user — server actions are public POST endpoints.
 */
export async function simulateTick() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not signed in" };
  const res = await runTick();
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/alerts");
  revalidatePath("/spread");
  return { ok: true as const, ...res };
}
