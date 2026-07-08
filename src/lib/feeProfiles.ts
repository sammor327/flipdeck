// Merges a user's fee-profile overrides (UserSettings.feeProfiles, a JSON string
// column edited in Settings) over DEFAULT_FEE_PROFILES. An override is honored
// only when all three fields are finite numbers, so malformed or partial JSON
// can never NaN-poison money math — bad rows fall back to the defaults.

import type { FeeProfile, Marketplace } from "./constants";
import { DEFAULT_FEE_PROFILES, MARKETPLACES } from "./constants";
import { fromJson } from "./json";

function isValidProfile(value: unknown): value is FeeProfile {
  if (typeof value !== "object" || value == null) return false;
  const { feePct, paymentFeePct, shippingFlat } = value as Record<string, unknown>;
  return Number.isFinite(feePct) && Number.isFinite(paymentFeePct) && Number.isFinite(shippingFlat);
}

/**
 * Full per-marketplace fee profiles for a user: their stored overrides merged
 * over the defaults. Accepts the raw JSON column value (null/undefined/garbage
 * all yield pure defaults).
 */
export function mergeFeeProfiles(feeProfilesJson: string | null | undefined): Record<Marketplace, FeeProfile> {
  const merged: Record<Marketplace, FeeProfile> = { ...DEFAULT_FEE_PROFILES };
  const overrides = fromJson<unknown>(feeProfilesJson, {});
  if (typeof overrides !== "object" || overrides == null) return merged;
  for (const m of MARKETPLACES) {
    const candidate = (overrides as Record<string, unknown>)[m.id];
    if (isValidProfile(candidate)) merged[m.id] = candidate;
  }
  return merged;
}

/**
 * Sanitize untrusted fee-profile overrides (e.g. a client payload) before they
 * are persisted: keep only known marketplace keys whose value has all three
 * finite fields, and copy just those fields. Unknown keys, partial profiles,
 * and non-finite values are dropped so stored overrides can never NaN-poison
 * money math downstream.
 */
export function sanitizeFeeProfileOverrides(overrides: unknown): Partial<Record<Marketplace, FeeProfile>> {
  const out: Partial<Record<Marketplace, FeeProfile>> = {};
  if (typeof overrides !== "object" || overrides == null) return out;
  for (const m of MARKETPLACES) {
    const candidate = (overrides as Record<string, unknown>)[m.id];
    if (isValidProfile(candidate)) {
      out[m.id] = { feePct: candidate.feePct, paymentFeePct: candidate.paymentFeePct, shippingFlat: candidate.shippingFlat };
    }
  }
  return out;
}
