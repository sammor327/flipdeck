"use server";

import { revalidatePath } from "next/cache";
import { runTick } from "@/lib/worker/tick";

/**
 * Run one ingest tick on demand (the "↻ Refresh prices" button). In production
 * the standalone worker (`npm run worker`) does this on a schedule.
 */
export async function simulateTick() {
  const res = await runTick();
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/alerts");
  revalidatePath("/spread");
  return res;
}
