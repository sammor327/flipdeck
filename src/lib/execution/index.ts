// Execution layer. Per the compliance guardrail, no marketplace in v1 permits
// automated order placement within its ToS, so every adapter runs in "deeplink"
// mode: "execute" means open a prefilled listing/checkout deep link and the
// human completes the trade. The mode is a per-marketplace property
// (MARKETPLACES[].executionMode) and is surfaced in the UI — flip one to "api"
// (and implement placeOrder) only where a marketplace legitimately supports it.

import type { GameSlug, Marketplace, Side } from "../constants";
import { marketplaceById } from "../constants";

export interface ExecCardRef {
  name: string;
  setName: string;
  setCode: string;
  gameSlug: GameSlug;
}

export interface Execution {
  mode: "deeplink" | "api";
  url: string;
  /** Button label, e.g. "Open TCGplayer listing". */
  label: string;
  /** Plain-language description of what approving does (shown in UI + logs). */
  description: string;
}

// Cardmarket organizes products by game path; only the games it carries.
const CARDMARKET_GAME_PATH: Partial<Record<GameSlug, string>> = {
  mtg: "Magic",
  yugioh: "YuGiOh",
  pokemon: "Pokemon",
  lorcana: "Lorcana",
};

export function buildDeepLink(marketplace: Marketplace, side: Side, card: ExecCardRef): string {
  const query = encodeURIComponent(`${card.name} ${card.setName}`.trim());
  const nameOnly = encodeURIComponent(card.name);
  switch (marketplace) {
    case "tcgplayer":
      // TCGplayer product search; from a product page the user lists or buys.
      return `https://www.tcgplayer.com/search/all/product?q=${query}&view=grid`;
    case "cardmarket": {
      const path = CARDMARKET_GAME_PATH[card.gameSlug];
      return path
        ? `https://www.cardmarket.com/en/${path}/Products/Search?searchString=${nameOnly}`
        : `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${nameOnly}`;
    }
    case "ebay":
      return side === "sell"
        ? `https://www.ebay.com/sh/lst/active`
        : `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1`;
    default:
      return "https://www.tcgplayer.com";
  }
}

export function executionModeFor(marketplace: Marketplace): "deeplink" | "api" {
  return marketplaceById(marketplace)?.executionMode ?? "deeplink";
}

export function resolveExecution(args: { marketplace: Marketplace; side: Side; card: ExecCardRef }): Execution {
  const { marketplace, side, card } = args;
  const mode = executionModeFor(marketplace);
  const url = buildDeepLink(marketplace, side, card);
  const mpName = marketplaceById(marketplace)?.name ?? marketplace;
  if (mode === "api") {
    return {
      mode,
      url,
      label: side === "sell" ? `List on ${mpName} via API` : `Buy on ${mpName} via API`,
      description: `Places the ${side} order directly through ${mpName}'s API.`,
    };
  }
  return {
    mode,
    url,
    label: side === "sell" ? `Open ${mpName} listing` : `Open ${mpName} checkout`,
    description:
      side === "sell"
        ? `Opens a prefilled ${mpName} listing — you confirm the sale (ToS-compliant, human in the loop).`
        : `Opens a prefilled ${mpName} search/checkout — you confirm the purchase (ToS-compliant, human in the loop).`,
  };
}
