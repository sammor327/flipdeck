// Safety guardrails for the proposal engine: the kill switch and the daily
// spend cap (Settings → Safety limits). Pure — the worker loads UserSettings
// and today's committed buys, this module just decides.

export interface GuardrailSettings {
  killSwitch: boolean;
  dailySpendCap: number;
}

export interface GuardrailResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Decide whether a would-be proposal is allowed to fire.
 *
 * Rules:
 * - `killSwitch` blocks everything (buys, sells, any value).
 * - `dailySpendCap > 0` blocks a BUY when today's already-committed buys plus
 *   this order would exceed the cap. Sells are never capped — it is a spend cap.
 * - `dailySpendCap <= 0` means no cap.
 * - `settings === null` (no UserSettings row yet, e.g. a new user) blocks nothing.
 */
export function checkProposalGuardrails(
  settings: GuardrailSettings | null,
  side: "buy" | "sell",
  orderValue: number,
  buysCommittedToday: number
): GuardrailResult {
  if (!settings) return { blocked: false };
  if (settings.killSwitch) {
    return { blocked: true, reason: "kill switch is on — all proposals paused" };
  }
  if (side === "buy" && settings.dailySpendCap > 0 && buysCommittedToday + orderValue > settings.dailySpendCap) {
    return {
      blocked: true,
      reason: `daily spend cap $${settings.dailySpendCap} would be exceeded ($${buysCommittedToday} committed today + $${orderValue} order)`,
    };
  }
  return { blocked: false };
}
