// Pure quiet-hours check. Times are minutes-past-midnight; the window may wrap
// across midnight (e.g. 22:00 → 07:00).

export interface QuietHoursConfig {
  enabled: boolean;
  start: number; // minutes past midnight
  end: number;
}

export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function isQuietHours(cfg: QuietHoursConfig, now: Date): boolean {
  if (!cfg.enabled || cfg.start === cfg.end) return false;
  const m = minuteOfDay(now);
  if (cfg.start < cfg.end) return m >= cfg.start && m < cfg.end;
  return m >= cfg.start || m < cfg.end; // wraps midnight
}
