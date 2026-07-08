// Rate-limited provider wrapper. The worker's ingest loop calls fetchQuotes
// once per card against real external APIs (Scryfall documents ~10 req/s; the
// others publish no hard number but will throttle or IP-ban abusers). Wrapping
// the real adapter here makes every fetch await a token from the shared
// limiter first — buckets are keyed by provider.id, so two games sharing an
// API share a budget. If no token arrives within `maxWaitMs` the fetch
// resolves to [], the same "real provider came back empty" shape that
// withMockFallback (see index.ts) already turns into mock quotes.
//
// Dependencies (limiter, sleep, maxWaitMs) are injectable so tests can drive
// fake time; production callers pass none and get the process-wide singleton.

import { rateLimiter, type RateLimiter } from "../queue";
import type { PriceProvider, ProviderCardRef, ProviderQuote } from "./types";

/** How long to sleep between token retries. */
const RETRY_MS = 120;
/** Give up (return []) after waiting this long for a token. */
const DEFAULT_MAX_WAIT_MS = 4000;

export interface RateLimitDeps {
  limiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
  maxWaitMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A provider that acquires a token (at most `perSecond`/s) before delegating. */
export function withRateLimit(provider: PriceProvider, perSecond: number, deps: RateLimitDeps = {}): PriceProvider {
  const limiter = deps.limiter ?? rateLimiter;
  const sleep = deps.sleep ?? realSleep;
  const maxWaitMs = deps.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  return {
    id: provider.id,
    supports: (game) => provider.supports(game),
    async fetchQuotes(card: ProviderCardRef): Promise<ProviderQuote[]> {
      let waited = 0;
      while (!(await limiter.take(provider.id, perSecond))) {
        if (waited >= maxWaitMs) return [];
        await sleep(RETRY_MS);
        waited += RETRY_MS;
      }
      return provider.fetchQuotes(card);
    },
  };
}
