// Worker entry point. `npm run worker` loops on an interval; `npm run worker:once`
// runs a single tick and exits. In a real deployment this would be a cron job or
// a queue consumer; here it's a simple long-running Node process so no external
// scheduler is required.

import "../loadenv";
import { prisma } from "../db";
import { runTick } from "./tick";

const once = process.argv.includes("--once");
const tickMs = Math.max(5000, Number(process.env.WORKER_TICK_MS || 60000));

async function tick(n: number): Promise<void> {
  const started = Date.now();
  const res = await runTick();
  // eslint-disable-next-line no-console
  console.log(
    `[worker] tick #${n} in ${Date.now() - started}ms —`,
    `${res.cards} cards, +${res.quotesInserted} quotes, ${res.proposalsCreated} proposals, ${res.expired} expired`
  );
}

async function main() {
  if (once) {
    await tick(1);
    await prisma.$disconnect();
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[worker] started — ingesting every ${tickMs}ms. Ctrl+C to stop.`);
  let n = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  // Self-scheduling loop, not setInterval: the next tick is armed only after
  // the previous one settles, so a tick slower than WORKER_TICK_MS delays its
  // successor instead of stacking concurrent ticks.
  const loop = () => {
    timer = null;
    tick(++n)
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[worker] tick error:", e);
      })
      .finally(() => {
        if (!stopped) timer = setTimeout(loop, tickMs);
      });
  };
  const shutdown = async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  loop();
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal:", e);
  await prisma.$disconnect();
  process.exit(1);
});
