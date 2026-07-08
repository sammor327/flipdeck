// Queue singletons. In-memory by default. To back these with Redis, implement
// the same interfaces against a Redis client and swap the exports here based on
// process.env.REDIS_URL — no call site changes.

import { MemoryQueue, MemoryRateLimiter } from "./memory";
import type { Queue, RateLimiter } from "./types";

const globalForQueue = globalThis as unknown as {
  fdRateLimiter?: RateLimiter;
  fdNotifyQueue?: Queue<unknown>;
};

export const rateLimiter: RateLimiter = (globalForQueue.fdRateLimiter ??= new MemoryRateLimiter());
export const notifyQueue: Queue<unknown> = (globalForQueue.fdNotifyQueue ??= new MemoryQueue());

export const usingRedis = Boolean(process.env.REDIS_URL);

export * from "./types";
