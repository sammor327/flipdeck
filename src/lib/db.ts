import { PrismaClient } from "@prisma/client";

// Singleton Prisma client. In dev, Next's hot-reload would otherwise spawn a new
// client per reload and exhaust connections; stash it on globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// SQLite pragmas for the two-process dev setup (`next dev` + `npm run worker`
// both write dev.db). WAL lets readers proceed while the worker's tick writes;
// busy_timeout makes a blocked writer wait out the lock instead of failing with
// SQLITE_BUSY ("database is locked"). journal_mode=WAL persists in the database
// file; busy_timeout is per-connection, which is why DATABASE_URL recommends
// `?connection_limit=1` (see README). PRAGMA statements return rows, so
// $queryRawUnsafe (not $executeRawUnsafe). Fire-and-forget: a failure here
// (e.g. no DB file yet during a build, or missing permissions) must never make
// importing this module throw.
function applySqlitePragmas(client: PrismaClient) {
  void (async () => {
    await client.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await client.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
  })().catch(() => {});
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Only on fresh construction — not on every hot reload of this module.
  applySqlitePragmas(client);
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
