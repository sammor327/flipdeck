// Upcoming set releases, rotations, and ban-list events — the calendar that
// tells a flipper when the market is about to move. Curated static data (a real
// deployment would ingest this from publisher calendars / a CMS). Dates are
// illustrative, anchored around mid-2026.

import type { GameSlug } from "./constants";

export type ReleaseType = "release" | "rotation" | "banlist" | "spoilers";

export interface ReleaseEvent {
  id: string;
  game: GameSlug | "all";
  title: string;
  date: string; // ISO yyyy-mm-dd
  type: ReleaseType;
  note: string;
}

export const RELEASE_TYPE_META: Record<ReleaseType, { label: string; icon: string }> = {
  release: { label: "Set release", icon: "📦" },
  rotation: { label: "Rotation", icon: "🔄" },
  banlist: { label: "Ban / restricted", icon: "🚫" },
  spoilers: { label: "Spoiler season", icon: "🔮" },
};

export const RELEASES: ReleaseEvent[] = [
  { id: "pkm-mega", game: "pokemon", title: "Pokémon TCG — Mega Evolution", date: "2026-07-18", type: "release", note: "Charizard chase SIR confirmed; expect a pre-release run-up then a dip." },
  { id: "mtg-brc", game: "mtg", title: "MTG — Banned & Restricted announcement", date: "2026-07-21", type: "banlist", note: "Modern/Standard watchlist. Bans crater a card; unbans spike it." },
  { id: "rift-pvg", game: "riftbound", title: "Riftbound — Proving Grounds", date: "2026-07-25", type: "release", note: "Second Riftbound set. Beta data — expect volatility and thin liquidity." },
  { id: "mtg-eoe", game: "mtg", title: "MTG — Edge of Eternities", date: "2026-08-01", type: "release", note: "Fall premier set. Chase mythics historically peak week one, soften by week three." },
  { id: "ygo-rota", game: "yugioh", title: "Yu-Gi-Oh! — Rage of the Abyss", date: "2026-08-08", type: "release", note: "New core set. Meta staples move on competitive reveals." },
  { id: "lor-ch7", game: "lorcana", title: "Disney Lorcana — Archazia's Island", date: "2026-08-29", type: "release", note: "Chapter 7. Enchanted pulls drive the secondary market." },
  { id: "mtg-rotation", game: "mtg", title: "MTG — Standard rotation", date: "2026-09-15", type: "rotation", note: "Four sets leave Standard. Rotating staples typically dip 20–40% into rotation." },
  { id: "pkm-rotation", game: "pokemon", title: "Pokémon — Standard rotation (F/G regulation)", date: "2026-09-26", type: "rotation", note: "Regulation mark rotates; tournament staples lose Standard legality." },
  { id: "mtg-avatar", game: "mtg", title: "MTG — Universes Beyond: Avatar spoilers begin", date: "2026-10-03", type: "spoilers", note: "Crossover hype cycle. Watch for spec buying on first previews." },
  { id: "ygo-25th", game: "yugioh", title: "Yu-Gi-Oh! — Quarter Century wave 3", date: "2026-10-17", type: "release", note: "Premium reprints; QCSR variants command a premium." },
];

/** Whole days from `now` to the event (negative = already passed). */
export function daysUntil(dateISO: string, now = new Date()): number {
  const target = new Date(dateISO + "T00:00:00");
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - startOfToday.getTime()) / (24 * 3600 * 1000));
}

export function relativeDay(dateISO: string, now = new Date()): string {
  const d = daysUntil(dateISO, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return `in ${d} days`;
  if (d === -1) return "yesterday";
  return `${Math.abs(d)} days ago`;
}
