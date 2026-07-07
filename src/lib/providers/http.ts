// Tiny fetch helper with a timeout. Real adapters use this and swallow all
// errors (returning null) so a flaky data source degrades to the mock rather
// than crashing an ingest tick.

export async function safeFetchJson<T = unknown>(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 8000
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { "User-Agent": "FlipDeck/1.0 (+https://flipdeck.local)", Accept: "application/json", ...(opts.headers || {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) && n > 0 ? n : null;
}
