import type { ProposeSide, RuleTrigger, Side } from "../constants";

/** Parsed rule params (the JSON blob on AlertRule.params, decoded). */
export interface RuleParams {
  threshold?: number; // for threshold_above / threshold_below
  windowHours?: number; // for pct_move
  movePct?: number; // magnitude for pct_move (e.g. 15 → 15%)
  direction?: "up" | "down" | "either"; // for pct_move
  spreadPct?: number; // for spread
  lookbackDays?: number; // for new_low
}

/** The trigger-relevant slice of a rule, decoded from the DB row. */
export interface RuleLike {
  trigger: RuleTrigger;
  params: RuleParams;
  proposeSide: ProposeSide;
  cooldownMinutes: number;
  lastFiredAt?: Date | null;
  enabled?: boolean;
}

/**
 * Everything the evaluator needs about a card's current market, precomputed by
 * the stat engine. Closures keep arbitrary windows/lookbacks flexible while the
 * evaluator stays pure and cheap.
 */
export interface EvalContext {
  now: Date;
  currentPrice: number;
  /** Signed % move over an arbitrary trailing window (hours). */
  moveOverHours: (hours: number) => number | null;
  /** Lowest price over an arbitrary lookback (days). */
  lowestOverDays: (days: number) => number | null;
  /** Best cross-marketplace spread % after fees, if computable. */
  bestSpreadPct: number | null;
}

export interface EvalResult {
  fired: boolean;
  suppressedByCooldown: boolean;
  side?: Side;
  reason?: string;
  evidence: Record<string, string | number>;
}
