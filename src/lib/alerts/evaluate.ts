// Alert-rule evaluation. Pure: given a decoded rule and a precomputed market
// context, decide whether the rule fires, on which side, and why. The stat
// engine does the heavy lifting (deltas, spreads) so this stays O(rules).
//
// Unit-tested in evaluate.test.ts: threshold, % move (direction-aware),
// spread, new-low, and cooldown suppression.

import type { ProposeSide, RuleTrigger, Side } from "../constants";
import { formatSignedPercent, formatMoney } from "../format";
import type { EvalContext, EvalResult, RuleLike } from "./types";

const NEW_LOW_TOLERANCE = 1.0001; // currentPrice within 0.01% of the min counts as a new low

/** Minutes elapsed since the rule last fired, or Infinity if it never has. */
export function minutesSince(last: Date | null | undefined, now: Date): number {
  if (!last) return Infinity;
  return (now.getTime() - last.getTime()) / 60000;
}

export function inCooldown(rule: RuleLike, now: Date): boolean {
  return minutesSince(rule.lastFiredAt, now) < rule.cooldownMinutes;
}

/**
 * Resolve the trade side. "auto" picks the side that makes sense for the
 * trigger: you sell into strength (price high / moved up) and buy into weakness
 * (price low / moved down / new low / a spread you can flip).
 */
export function resolveSide(
  proposeSide: ProposeSide,
  trigger: RuleTrigger,
  moveDirection: "up" | "down" | "flat"
): Side {
  if (proposeSide === "buy" || proposeSide === "sell") return proposeSide;
  switch (trigger) {
    case "threshold_above":
      return "sell";
    case "threshold_below":
      return "buy";
    case "new_low":
    case "spread":
      return "buy";
    case "pct_move":
      return moveDirection === "down" ? "buy" : "sell";
    default:
      return "sell";
  }
}

export function evaluateRule(rule: RuleLike, ctx: EvalContext): EvalResult {
  const base: EvalResult = { fired: false, suppressedByCooldown: false, evidence: {} };
  if (rule.enabled === false) return base;

  // Cooldown gates everything: a rule whose condition is met but is still
  // cooling down does not fire (prevents spam on volatile cards).
  if (inCooldown(rule, ctx.now)) {
    return { ...base, suppressedByCooldown: true };
  }

  const p = rule.params;

  switch (rule.trigger) {
    case "threshold_above": {
      const t = p.threshold ?? Infinity;
      if (ctx.currentPrice >= t) {
        return fire(rule, "up", `Price ${formatMoney(ctx.currentPrice)} crossed above ${formatMoney(t)}`, {
          price: ctx.currentPrice,
          threshold: t,
        });
      }
      return base;
    }

    case "threshold_below": {
      const t = p.threshold ?? -Infinity;
      if (ctx.currentPrice <= t) {
        return fire(rule, "down", `Price ${formatMoney(ctx.currentPrice)} fell below ${formatMoney(t)}`, {
          price: ctx.currentPrice,
          threshold: t,
        });
      }
      return base;
    }

    case "pct_move": {
      const hours = p.windowHours ?? 24;
      const need = Math.abs(p.movePct ?? 0);
      const move = ctx.moveOverHours(hours);
      if (move == null) return base;
      const dir = p.direction ?? "either";
      const magnitudeOk = Math.abs(move) >= need;
      const directionOk =
        dir === "either" || (dir === "up" && move > 0) || (dir === "down" && move < 0);
      if (magnitudeOk && directionOk) {
        const moveDir = move > 0 ? "up" : move < 0 ? "down" : "flat";
        return fire(
          rule,
          moveDir,
          `Moved ${formatSignedPercent(move)} over ${hours}h (≥ ${need}% ${dir})`,
          { movePct: move, windowHours: hours }
        );
      }
      return base;
    }

    case "spread": {
      const need = p.spreadPct ?? 0;
      if (ctx.bestSpreadPct != null && ctx.bestSpreadPct >= need) {
        return fire(
          rule,
          "flat",
          `Cross-market spread ${formatSignedPercent(ctx.bestSpreadPct)} after fees (≥ ${need}%)`,
          { spreadPct: ctx.bestSpreadPct, threshold: need }
        );
      }
      return base;
    }

    case "new_low": {
      const days = p.lookbackDays ?? 90;
      const low = ctx.lowestOverDays(days);
      if (low != null && ctx.currentPrice <= low * NEW_LOW_TOLERANCE) {
        return fire(rule, "down", `New ${days}-day low at ${formatMoney(ctx.currentPrice)}`, {
          price: ctx.currentPrice,
          low,
          lookbackDays: days,
        });
      }
      return base;
    }

    default:
      return base;
  }
}

function fire(
  rule: RuleLike,
  moveDirection: "up" | "down" | "flat",
  reason: string,
  evidence: Record<string, string | number>
): EvalResult {
  return {
    fired: true,
    suppressedByCooldown: false,
    side: resolveSide(rule.proposeSide, rule.trigger, moveDirection),
    reason,
    evidence,
  };
}
