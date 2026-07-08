// Queue + rate-limit interfaces. The brief calls for Redis; the default
// implementation is in-memory (see memory.ts) so nothing external is
// required. Every method is async so a Redis-backed implementation is a
// drop-in replacement behind the same interface (see index.ts / REDIS_URL).

export interface RateLimiter {
  /** Try to consume one token for `key`; true if allowed under `perSecond`. */
  take(key: string, perSecond: number): Promise<boolean>;
}

export interface Job<T> {
  id: string;
  payload: T;
}

export interface Queue<T> {
  enqueue(payload: T): Promise<void>;
  dequeueBatch(max: number): Promise<T[]>;
  size(): Promise<number>;
}
