// Central catalog of games, marketplaces, and conditions. Enum-like values live
// here (not in the DB as native enums) so the schema stays SQLite/Postgres
// portable and adding a game/marketplace is a data change, not a migration of
// enum types. These are also the source of truth for zod validation.

export type GameSlug = "mtg" | "riftbound" | "yugioh" | "pokemon" | "lorcana";

export interface GameMeta {
  slug: GameSlug;
  name: string;
  icon: string;
  accentColor: string;
  dataQuality: "stable" | "beta";
  sortOrder: number;
}

// Colors mirror the --g-* tokens in the mockups.
export const GAMES: GameMeta[] = [
  { slug: "mtg", name: "Magic: The Gathering", icon: "✦", accentColor: "#3987e5", dataQuality: "stable", sortOrder: 0 },
  { slug: "riftbound", name: "Riftbound", icon: "◆", accentColor: "#199e70", dataQuality: "beta", sortOrder: 1 },
  { slug: "yugioh", name: "Yu-Gi-Oh!", icon: "◉", accentColor: "#c98500", dataQuality: "stable", sortOrder: 2 },
  { slug: "pokemon", name: "Pokémon TCG", icon: "⬤", accentColor: "#008300", dataQuality: "stable", sortOrder: 3 },
  { slug: "lorcana", name: "Disney Lorcana", icon: "✧", accentColor: "#9085e9", dataQuality: "stable", sortOrder: 4 },
];

export const gameBySlug = (slug: string): GameMeta | undefined =>
  GAMES.find((g) => g.slug === slug);

// ── Conditions ───────────────────────────────────────────────────────────────
export type Condition = "NM" | "LP" | "MP" | "HP" | "DM";
export const CONDITIONS: { code: Condition; label: string }[] = [
  { code: "NM", label: "Near Mint" },
  { code: "LP", label: "Lightly Played" },
  { code: "MP", label: "Moderately Played" },
  { code: "HP", label: "Heavily Played" },
  { code: "DM", label: "Damaged" },
];

/** Price of a condition relative to NM. Single source of truth for pricing a
 * held copy that isn't Near Mint. */
export const CONDITION_MULTIPLIER: Record<Condition, number> = {
  NM: 1,
  LP: 0.85,
  MP: 0.72,
  HP: 0.58,
  DM: 0.4,
};

// Accepts codes ("NM"), display labels ("Near Mint"), and common aliases, all
// case-insensitively. Built once at module load.
const CONDITION_LOOKUP: Record<string, Condition> = (() => {
  const map: Record<string, Condition> = { mint: "NM", m: "NM", dmg: "DM" };
  for (const { code, label } of CONDITIONS) {
    map[code.toLowerCase()] = code;
    map[label.toLowerCase()] = code;
  }
  return map;
})();

/** Normalize free-form condition input (CSV cells, form values) to a Condition
 * code, or null when unrecognized. Validation happens here at the write
 * boundary so the DB only ever holds canonical codes. */
export function normalizeCondition(input: string | null | undefined): Condition | null {
  if (input == null) return null;
  return CONDITION_LOOKUP[input.trim().toLowerCase()] ?? null;
}

/** Multiplier for a condition string of unknown provenance (e.g. a legacy DB
 * row). Unrecognized values fall back to the NM multiplier — never undefined,
 * so downstream math can't NaN. */
export function conditionMultiplier(condition: string): number {
  return CONDITION_MULTIPLIER[condition as Condition] ?? 1;
}

// ── Marketplaces ─────────────────────────────────────────────────────────────
export type Marketplace = "tcgplayer" | "cardmarket" | "ebay";

export interface MarketplaceMeta {
  id: Marketplace;
  name: string;
  currency: string;
  region: string;
  /**
   * How the execution layer acts for this marketplace. Compliance posture lives
   * in code and is surfaced in the UI. No marketplace in v1 permits automated
   * order placement within its ToS, so all default to deep-link.
   */
  executionMode: "deeplink" | "api";
  /** Default seller fee profile (overridable per user in Settings). */
  defaultFee: FeeProfile;
}

export interface FeeProfile {
  feePct: number; // marketplace commission %
  paymentFeePct: number; // payment processing %
  shippingFlat: number; // seller-borne shipping cost per order, in marketplace currency
}

export const MARKETPLACES: MarketplaceMeta[] = [
  {
    id: "tcgplayer",
    name: "TCGplayer",
    currency: "USD",
    region: "US",
    executionMode: "deeplink",
    defaultFee: { feePct: 10.25, paymentFeePct: 2.5, shippingFlat: 0 },
  },
  {
    id: "cardmarket",
    name: "Cardmarket",
    currency: "EUR",
    region: "EU",
    executionMode: "deeplink",
    defaultFee: { feePct: 5, paymentFeePct: 0, shippingFlat: 0 },
  },
  {
    id: "ebay",
    name: "eBay",
    currency: "USD",
    region: "US",
    executionMode: "deeplink",
    defaultFee: { feePct: 13.25, paymentFeePct: 0, shippingFlat: 0 },
  },
];

export const marketplaceById = (id: string): MarketplaceMeta | undefined =>
  MARKETPLACES.find((m) => m.id === id);

/**
 * Which marketplaces carry a game. Riftbound is the youngest ecosystem — no
 * Cardmarket coverage yet — so it trades on TCGplayer + eBay comps only.
 */
export function marketplacesForGame(slug: GameSlug): Marketplace[] {
  if (slug === "riftbound") return ["tcgplayer", "ebay"];
  return ["tcgplayer", "cardmarket", "ebay"];
}

export const DEFAULT_FEE_PROFILES: Record<Marketplace, FeeProfile> = {
  tcgplayer: MARKETPLACES[0].defaultFee,
  cardmarket: MARKETPLACES[1].defaultFee,
  ebay: MARKETPLACES[2].defaultFee,
};

// Default marketplace shown per game (used for the "primary" MarketStat).
export const DEFAULT_MARKETPLACE_BY_GAME: Record<GameSlug, Marketplace> = {
  mtg: "tcgplayer",
  riftbound: "tcgplayer",
  yugioh: "tcgplayer",
  pokemon: "tcgplayer",
  lorcana: "tcgplayer",
};

// Simple EUR→USD rate used to normalize Cardmarket into the portfolio currency.
// In production this would come from a rates feed; fixed here for the demo.
export const EUR_USD = 1.08;

// ── Enum-ish string unions used across the app ───────────────────────────────
export type Side = "buy" | "sell";
export type ProposeSide = "buy" | "sell" | "auto";
export type ProposalStatus = "pending" | "approved" | "declined" | "expired" | "executed";
export type ItemStatus = "owned" | "listed" | "sold";
export type RuleScope = "card" | "watchlist" | "inventory";
export type RuleTrigger =
  | "threshold_above"
  | "threshold_below"
  | "pct_move"
  | "spread"
  | "new_low";
export type RuleAction = "notify" | "propose_trade";
export type ExecutionMode = "deeplink" | "api";
export type NotificationChannel = "webpush" | "console" | "email";

export const RULE_TRIGGER_LABELS: Record<RuleTrigger, string> = {
  threshold_above: "Price rises above…",
  threshold_below: "Price falls below…",
  pct_move: "% move within window…",
  spread: "Cross-market spread exceeds…",
  new_low: "New low over lookback…",
};

export const DEFAULT_PROPOSAL_EXPIRY_MINUTES = 30;
export const DEFAULT_COOLDOWN_MINUTES = 360;
export const UNDO_WINDOW_MS = 5000;
export const FAST_LANE_MINUTES = 5;
export const DEFAULT_POLL_MINUTES = 60;
