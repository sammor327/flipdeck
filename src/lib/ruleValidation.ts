// Write-boundary validation for alert rules. createRule accepts client-shaped
// input, and a bad row is worse than a rejected one: an unknown marketplace
// makes fee math NaN, a missing threshold never fires, and a card-scoped rule
// without a card resolves to zero targets forever — all silently. This module
// rejects broken core semantics with a human-readable error and clamps
// merely-out-of-range knobs (durations, quantity) to sane bounds.

import {
  RULE_TRIGGER_LABELS,
  marketplaceById,
  type ProposeSide,
  type RuleAction,
  type RuleScope,
  type RuleTrigger,
} from "./constants";

/** Shape of the rule-creation form payload. Lives here (not in the server
 * actions file) so the validator stays a pure, importable module; the actions
 * file re-exports it for existing client imports. */
export interface CreateRuleInput {
  name: string;
  scope: RuleScope;
  cardId?: string;
  trigger: RuleTrigger;
  threshold?: number;
  windowHours?: number;
  movePct?: number;
  direction?: "up" | "down" | "either";
  spreadPct?: number;
  lookbackDays?: number;
  action?: RuleAction;
  proposeSide?: ProposeSide;
  quantity?: number;
  marketplace?: string;
  cooldownMinutes?: number;
  proposalExpiryMinutes?: number;
  quietHoursRespected?: boolean;
}

export type RuleValidationResult =
  | { ok: true; value: CreateRuleInput }
  | { ok: false; error: string };

export const MAX_RULE_NAME_LENGTH = 80;

const RULE_SCOPES: readonly RuleScope[] = ["card", "watchlist", "inventory"];
const RULE_ACTIONS: readonly RuleAction[] = ["notify", "propose_trade"];
const PROPOSE_SIDES: readonly ProposeSide[] = ["buy", "sell", "auto"];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Validate and normalize rule input at the write boundary. Broken semantics
 * (unknown marketplace/trigger, missing threshold, NaN anywhere, card scope
 * without a card) reject; out-of-range durations/quantity clamp silently. */
export function validateRuleInput(input: CreateRuleInput): RuleValidationResult {
  const fail = (error: string): RuleValidationResult => ({ ok: false, error });

  const name = (input.name ?? "").trim().slice(0, MAX_RULE_NAME_LENGTH);
  if (!name) return fail("Name required");

  if (!(input.trigger in RULE_TRIGGER_LABELS)) return fail(`Unknown trigger "${input.trigger}"`);
  if (!RULE_SCOPES.includes(input.scope)) return fail(`Unknown scope "${input.scope}"`);

  const cardId = input.cardId?.trim() || undefined;
  if (input.scope === "card" && !cardId) return fail("Pick a card for a card-scoped rule");

  // Unknown marketplaces must not reach the DB: createProposal looks the value
  // up in the fee-profile map and an unknown key poisons netAfterFees to NaN.
  const marketplace = input.marketplace?.trim() || undefined;
  if (marketplace && !marketplaceById(marketplace)) {
    return fail(`Unknown marketplace "${marketplace}"`);
  }

  if (input.action !== undefined && !RULE_ACTIONS.includes(input.action)) {
    return fail(`Unknown action "${input.action}"`);
  }
  if (input.proposeSide !== undefined && !PROPOSE_SIDES.includes(input.proposeSide)) {
    return fail(`Unknown propose side "${input.proposeSide}"`);
  }

  // NaN/Infinity in any numeric field means the client sent garbage — reject
  // rather than guess. (Missing values are fine; defaults apply downstream.)
  const numericFields: [string, number | undefined][] = [
    ["Threshold", input.threshold],
    ["Window hours", input.windowHours],
    ["Move %", input.movePct],
    ["Spread %", input.spreadPct],
    ["Lookback days", input.lookbackDays],
    ["Quantity", input.quantity],
    ["Cooldown minutes", input.cooldownMinutes],
    ["Proposal expiry minutes", input.proposalExpiryMinutes],
  ];
  for (const [label, v] of numericFields) {
    if (v !== undefined && !Number.isFinite(v)) return fail(`${label} must be a number`);
  }

  if (input.trigger === "threshold_above" || input.trigger === "threshold_below") {
    if (input.threshold === undefined || input.threshold <= 0) {
      return fail("Threshold must be a positive number");
    }
  }
  if (input.movePct !== undefined && (input.movePct <= 0 || input.movePct > 500)) {
    return fail("Move % must be greater than 0 and at most 500");
  }
  if (input.spreadPct !== undefined && (input.spreadPct <= 0 || input.spreadPct > 100)) {
    return fail("Spread % must be greater than 0 and at most 100");
  }

  return {
    ok: true,
    value: {
      ...input,
      name,
      cardId: input.scope === "card" ? cardId : undefined,
      marketplace,
      windowHours: input.windowHours === undefined ? undefined : clamp(input.windowHours, 1, 720),
      lookbackDays: input.lookbackDays === undefined ? undefined : clamp(input.lookbackDays, 1, 365),
      quantity: input.quantity === undefined ? undefined : clamp(Math.round(input.quantity), 1, 99),
      cooldownMinutes:
        input.cooldownMinutes === undefined ? undefined : clamp(input.cooldownMinutes, 5, 10080),
      proposalExpiryMinutes:
        input.proposalExpiryMinutes === undefined ? undefined : clamp(input.proposalExpiryMinutes, 5, 1440),
    },
  };
}
