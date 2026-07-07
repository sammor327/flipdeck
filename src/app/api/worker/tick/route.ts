import { NextResponse, type NextRequest } from "next/server";
import { runTick } from "@/lib/worker/tick";

// POST /api/worker/tick → run one ingest tick. Lets an external cron/queue drive
// the worker over HTTP. If WORKER_TRIGGER_KEY is set, the request must send it as
// `x-worker-key`; otherwise (dev) it's open.
export async function POST(req: NextRequest) {
  const key = process.env.WORKER_TRIGGER_KEY;
  if (key && req.headers.get("x-worker-key") !== key) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const fastLaneOnly = req.nextUrl.searchParams.get("fast") === "1";
  const result = await runTick({ fastLaneOnly });
  return NextResponse.json({ ok: true, ...result });
}
