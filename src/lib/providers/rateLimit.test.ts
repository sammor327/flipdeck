import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimiter } from "../queue";
import { MemoryRateLimiter } from "../queue/memory";
import { mockProvider, providerFor } from "./index";
import { withRateLimit } from "./rateLimit";
import type { ProviderCardRef, ProviderQuote } from "./types";

const cardRef: ProviderCardRef = {
  id: "card-1",
  gameSlug: "mtg",
  name: "Test Card",
  setCode: "TST",
  setName: "Test Set",
  collectorNumber: "1",
  finish: "nonfoil",
};

const quote: ProviderQuote = {
  marketplace: "tcgplayer",
  condition: "NM",
  priceType: "market",
  price: 4.2,
  currency: "USD",
};

/** A provider that counts fetchQuotes calls and always returns one quote. */
function countingProvider(id: string) {
  const p = {
    id,
    calls: 0,
    supports: () => true,
    fetchQuotes: async (): Promise<ProviderQuote[]> => {
      p.calls++;
      return [quote];
    },
  };
  return p;
}

/** A sleep that never actually waits but records how long it was asked to. */
function fakeSleep() {
  const s = {
    slept: [] as number[],
    fn: async (ms: number) => {
      s.slept.push(ms);
    },
  };
  return s;
}

describe("MemoryRateLimiter (fake clock)", () => {
  it("allows the first perSecond takes then denies", async () => {
    const limiter = new MemoryRateLimiter(() => 1_000_000);
    for (let i = 0; i < 5; i++) {
      expect(await limiter.take("k", 5)).toBe(true);
    }
    expect(await limiter.take("k", 5)).toBe(false);
  });

  it("refills tokens as fake time advances, capped at the budget", async () => {
    let now = 1_000_000;
    const limiter = new MemoryRateLimiter(() => now);
    // Drain the bucket (perSecond = 2).
    expect(await limiter.take("k", 2)).toBe(true);
    expect(await limiter.take("k", 2)).toBe(true);
    expect(await limiter.take("k", 2)).toBe(false);
    // Half a second at 2/s refills exactly one token.
    now += 500;
    expect(await limiter.take("k", 2)).toBe(true);
    expect(await limiter.take("k", 2)).toBe(false);
    // A long idle period caps the refill at perSecond, not more.
    now += 60_000;
    expect(await limiter.take("k", 2)).toBe(true);
    expect(await limiter.take("k", 2)).toBe(true);
    expect(await limiter.take("k", 2)).toBe(false);
  });

  it("keeps buckets independent per key", async () => {
    const limiter = new MemoryRateLimiter(() => 1_000_000);
    expect(await limiter.take("a", 1)).toBe(true);
    expect(await limiter.take("a", 1)).toBe(false);
    expect(await limiter.take("b", 1)).toBe(true);
  });
});

describe("withRateLimit", () => {
  it("delegates immediately when a token is available and preserves the id", async () => {
    const real = countingProvider("scryfall");
    const sleep = fakeSleep();
    const wrapped = withRateLimit(real, 5, { limiter: new MemoryRateLimiter(() => 0), sleep: sleep.fn });
    expect(wrapped.id).toBe("scryfall");
    expect(wrapped.supports("mtg")).toBe(true);
    expect(await wrapped.fetchQuotes(cardRef)).toEqual([quote]);
    expect(real.calls).toBe(1);
    expect(sleep.slept).toEqual([]);
  });

  it("sleeps and retries until a token frees up", async () => {
    const real = countingProvider("scryfall");
    let denials = 2;
    const limiter = { take: async () => (denials-- > 0 ? false : true) };
    const sleep = fakeSleep();
    const wrapped = withRateLimit(real, 5, { limiter, sleep: sleep.fn });
    expect(await wrapped.fetchQuotes(cardRef)).toEqual([quote]);
    expect(real.calls).toBe(1);
    expect(sleep.slept).toEqual([120, 120]);
  });

  it("returns [] after maxWaitMs of denial without calling the wrapped provider", async () => {
    const real = countingProvider("scryfall");
    const limiter = { take: async () => false };
    const sleep = fakeSleep();
    const wrapped = withRateLimit(real, 5, { limiter, sleep: sleep.fn, maxWaitMs: 480 });
    expect(await wrapped.fetchQuotes(cardRef)).toEqual([]);
    expect(real.calls).toBe(0);
    // 480ms budget at 120ms per retry = exactly 4 sleeps before giving up.
    expect(sleep.slept).toEqual([120, 120, 120, 120]);
  });

  it("uses the shared rateLimiter singleton when no limiter is injected", async () => {
    const key = `test-singleton-${Date.now()}-${Math.random()}`;
    const real = countingProvider(key);
    const wrapped = withRateLimit(real, 1, { sleep: async () => {}, maxWaitMs: 0 });
    // Fresh bucket → the one token is consumed from the SHARED singleton...
    expect(await wrapped.fetchQuotes(cardRef)).toEqual([quote]);
    // ...so a direct take on the singleton under the same key is now denied.
    expect(await rateLimiter.take(key, 1)).toBe(false);
  });
});

describe("providerFor rate-limit wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the mock provider unwrapped (never rate-limited)", () => {
    vi.stubEnv("PRICE_PROVIDER_MTG", "");
    expect(providerFor("mtg")).toBe(mockProvider);
    vi.stubEnv("PRICE_PROVIDER_MTG", "mock");
    expect(providerFor("mtg")).toBe(mockProvider);
  });

  it("wraps a configured real provider in rate limit + mock fallback", () => {
    vi.stubEnv("PRICE_PROVIDER_MTG", "scryfall");
    const provider = providerFor("mtg");
    // withMockFallback(withRateLimit(scryfall)) — the inner wrapper keeps the
    // real id, so the chain id proves both layers are present.
    expect(provider.id).toBe("scryfall+mock");
    expect(provider).not.toBe(mockProvider);
  });
});
