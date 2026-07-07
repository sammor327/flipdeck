// SQLite (via Prisma) has no native JSON scalar, so JSON payloads are stored as
// String columns and (de)serialized here. Keep this the single choke-point so a
// future Postgres migration to native Json touches only this file.

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === "") return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}
