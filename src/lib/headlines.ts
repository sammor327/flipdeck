// Community + market headlines — the "why is this moving" context feed. Curated
// static data for the demo (a real deployment would aggregate publisher news,
// subreddits, tournament coverage, and FlipDeck's own price signals).

import type { GameSlug } from "./constants";

export type HeadlineTag = "market" | "spoilers" | "banlist" | "tournament" | "reprint" | "rotation";

export interface Headline {
  id: string;
  game: GameSlug | "all";
  source: string;
  title: string;
  summary: string;
  date: string; // ISO yyyy-mm-dd
  tag: HeadlineTag;
}

export const HEADLINE_TAG_META: Record<HeadlineTag, { label: string; icon: string }> = {
  market: { label: "Market", icon: "📈" },
  spoilers: { label: "Spoilers", icon: "🔮" },
  banlist: { label: "Ban list", icon: "🚫" },
  tournament: { label: "Tournament", icon: "🏆" },
  reprint: { label: "Reprint", icon: "♻️" },
  rotation: { label: "Rotation", icon: "🔄" },
};

export const HEADLINES: Headline[] = [
  { id: "h1", game: "mtg", source: "FlipDeck Signals", title: "Ragavan spikes +18% in 24h after Pro Tour showing", date: "2026-07-05", tag: "market", summary: "A dominant Modern weekend pushed Ragavan past $71 on TCGplayer. Sold comps confirm real demand, not a stale-listing mirage." },
  { id: "h2", game: "pokemon", source: "PokéBeach", title: "Mega Evolution set list leaks — Charizard SIR confirmed", date: "2026-07-04", tag: "spoilers", summary: "Full spoiler expected next week. Charizard ex chase card historically drags the whole set's singles up pre-release." },
  { id: "h3", game: "mtg", source: "r/mtgfinance", title: "Standard rotation math: what leaves in September", date: "2026-07-03", tag: "rotation", summary: "Four sets rotate Sept 15. Community consensus: sell rotating Standard staples now, buy the dip after rotation for eternal-format demand." },
  { id: "h4", game: "yugioh", source: "YGOPRODeck", title: "Konami teases Rage of the Abyss archetype", date: "2026-07-02", tag: "spoilers", summary: "Early reveals hint at a new competitive deck. Snake-Eyes staples already ticking up on speculation." },
  { id: "h5", game: "lorcana", source: "Lorcast", title: "Archazia's Island preorders open — Enchanted odds unchanged", date: "2026-07-01", tag: "reprint", summary: "Ravensburger confirms print run guidance. Chapter 6 Enchanteds softening as attention shifts to Chapter 7." },
  { id: "h6", game: "riftbound", source: "Riftbound Central", title: "Proving Grounds spoilers drop — Jinx alt-art hype builds", date: "2026-06-30", tag: "spoilers", summary: "Showcase Jinx already up +46% since Origins. Beta data means wide spreads — confirm sold prices before chasing." },
  { id: "h7", game: "mtg", source: "FlipDeck Signals", title: "eBay sold data shows Sheoldred stabilizing near $85", date: "2026-06-29", tag: "market", summary: "After a volatile month, sold-price variance is tightening. Liquidity score back above 70 — a cleaner exit window." },
  { id: "h8", game: "all", source: "FlipDeck Weekly", title: "Ban-list watch: three formats with announcements this month", date: "2026-06-28", tag: "banlist", summary: "MTG (Jul 21) leads a busy month. Set price alerts on your speculative holds before the news drops." },
];
