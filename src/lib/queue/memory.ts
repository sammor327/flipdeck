// In-memory implementations of the queue interfaces. Process-local (a Redis
// implementation would make them shared across the web + worker processes), but
// sufficient for a single-process dev run and for tests.

import type { DirtySet, Queue, RateLimiter } from "./types";

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  async take(key: string, perSecond: number): Promise<boolean> {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: perSecond, last: t };
    // Refill proportionally to elapsed time, capped at the per-second budget.
    const elapsed = (t - b.last) / 1000;
    b.tokens = Math.min(perSecond, b.tokens + elapsed * perSecond);
    b.last = t;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.buckets.set(key, b);
      return true;
    }
    this.buckets.set(key, b);
    return false;
  }
}

export class MemoryDirtySet implements DirtySet {
  private set = new Set<string>();
  async add(id: string): Promise<void> {
    this.set.add(id);
  }
  async addMany(ids: string[]): Promise<void> {
    for (const id of ids) this.set.add(id);
  }
  async drain(): Promise<string[]> {
    const out = [...this.set];
    this.set.clear();
    return out;
  }
  async size(): Promise<number> {
    return this.set.size;
  }
}

export class MemoryQueue<T> implements Queue<T> {
  private items: T[] = [];
  async enqueue(payload: T): Promise<void> {
    this.items.push(payload);
  }
  async dequeueBatch(max: number): Promise<T[]> {
    return this.items.splice(0, max);
  }
  async size(): Promise<number> {
    return this.items.length;
  }
}
