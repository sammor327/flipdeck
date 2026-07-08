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

/**
 * The next moment the quiet-hours window ends, or null when `now` is not
 * inside the window (disabled, start === end, or currently outside it).
 * Handles the midnight wrap: at 23:30 with a 22:00 → 07:00 window the end is
 * tomorrow 07:00; at 06:00 it is today 07:00.
 */
export function quietHoursEnd(cfg: QuietHoursConfig, now: Date): Date | null {
  if (!isQuietHours(cfg, now)) return null;
  const end = new Date(now);
  end.setHours(Math.floor(cfg.end / 60), cfg.end % 60, 0, 0);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return end;
}
