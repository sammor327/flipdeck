// Seed: a fully-populated demo so `npm run dev` shows a working product with no
// API keys. Creates the 5 games, ~200 cards with 90 days of random-walk price
// history (plus a few days of cross-market quotes so spreads survive as the
// seed ages), cached MarketStats, and a demo user (Sam) with a 60-card
// inventory across all games, a watchlist, 3 alert rules, 5 pending approvals
// with staggered expiries, and a feed of past notifications
// (approved / expired-with-hindsight / declined).
//
// Deterministic (seeded RNG) so re-running produces the same demo.

import "../src/lib/loadenv";
import { prisma } from "../src/lib/db";
import {
  CONDITION_MULTIPLIER,
  DEFAULT_FEE_PROFILES,
  DEFAULT_MARKETPLACE_BY_GAME,
  GAMES,
  marketplacesForGame,
  type Condition,
  type GameSlug,
} from "../src/lib/constants";
import { netProceeds, buyEdge } from "../src/lib/fees";
import { computeMarketStat, type StatPoint } from "../src/lib/stats";
import { toJson } from "../src/lib/json";
import { round2 } from "../src/lib/math";
import { gaussian, seededRng } from "../src/lib/rng";
import { resolveExecution } from "../src/lib/execution";

const DAY_MS = 24 * 3600 * 1000;
const DAYS = 90;
const NOW = new Date();

// ── Card catalog ─────────────────────────────────────────────────────────────
interface CardDef {
  gameSlug: GameSlug;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  finish?: string;
  target: number; // desired current NM price
  recentDrift?: number; // per-day drift over the last week (sign = recent direction)
  imageUrl?: string; // real card art (publisher CDN) for marquee cards; others use generated art
}

// Marquee cards referenced by the mockups, given explicit prices so the demo
// mirrors the designs.
const MARQUEE: CardDef[] = [
  // NOTE: imageUrl is intentionally left unset so every card uses the
  // self-contained generated CardArt (no external hosts / offline-safe). To show
  // real art in an environment whose browser can reach publisher CDNs, set
  // imageUrl here (e.g. Scryfall "cards/named?...&format=image") and re-seed.
  { gameSlug: "mtg", name: "Ragavan, Nimble Pilferer", setName: "Modern Horizons 2", setCode: "MH2", collectorNumber: "138", rarity: "Mythic", target: 71.5, recentDrift: 0.022 },
  { gameSlug: "mtg", name: "The Meathook Massacre", setName: "Innistrad: Midnight Hunt", setCode: "MID", collectorNumber: "112", rarity: "Mythic", target: 47.2, recentDrift: -0.03 },
  { gameSlug: "mtg", name: "Sheoldred, the Apocalypse", setName: "Dominaria United", setCode: "DMU", collectorNumber: "107", rarity: "Mythic", target: 84.9, recentDrift: 0.006 },
  { gameSlug: "lorcana", name: "Elsa — Spirit of Winter", setName: "The First Chapter", setCode: "TFC", collectorNumber: "58", rarity: "Legendary", target: 38.2, recentDrift: -0.028 },
  { gameSlug: "pokemon", name: "Charizard ex (SAR)", setName: "Obsidian Flames", setCode: "OBF", collectorNumber: "223", rarity: "Special Art Rare", target: 182, recentDrift: -0.012 },
  { gameSlug: "yugioh", name: "Ash Blossom & Joyous Spring", setName: "Quarter Century Bonanza", setCode: "RA01", collectorNumber: "014", rarity: "Secret Rare", target: 47.35, recentDrift: 0.008 },
  { gameSlug: "riftbound", name: "Jinx, Loose Cannon (Showcase)", setName: "Origins", setCode: "OGN", collectorNumber: "201", rarity: "Epic", target: 24.1, recentDrift: 0.018 },
];

// Name pools for procedurally filling out ~40 cards per game.
const NAME_POOLS: Record<GameSlug, string[]> = {
  mtg: ["Sheoldred's Edict", "Orcish Bowmasters", "Fable of the Mirror-Breaker", "Wrenn and Six", "Grief", "Solitude", "Fury", "Urza's Saga", "Sword of Fire and Ice", "Mox Opal", "Teferi, Time Raveler", "Murktide Regent", "Bloodghast", "Thoughtseize", "Scalding Tarn", "Misty Rainforest", "Ledger Shredder", "Phlage, Titan of Fire's Fury", "Nadu, Winged Wisdom", "Psychosis Crawler", "Ancient Tomb", "The One Ring", "Delighted Halfling", "Minsc & Boo"],
  riftbound: ["Yasuo, the Unforgiven", "Ahri, Nine-Tailed", "Lux, Lady of Luminosity", "Darius, Hand of Noxus", "Teemo, Swift Scout", "Zed, Master of Shadows", "Ezreal, Prodigal Explorer", "Vi, Piltover Enforcer", "Katarina, Sinister Blade", "Garen, Might of Demacia", "Thresh, Chain Warden", "Miss Fortune, Bounty Hunter", "Volibear, Relentless Storm", "Ornn, Fire Below", "Sett, the Boss", "Viktor, Machine Herald", "Caitlyn, Sheriff", "Jhin, Virtuoso"],
  yugioh: ["Blue-Eyes White Dragon", "Dark Magician", "Accesscode Talker", "Snake-Eyes Ash", "Kashtira Fenrir", "Maxx \"C\"", "Effect Veiler", "Infinite Impermanence", "Nibiru, the Primal Being", "Triple Tactics Talent", "Called by the Grave", "Ghost Belle & Haunted Mansion", "S:P Little Knight", "Baronne de Fleur", "Apollousa", "Purrely", "Tearlaments Kitkallos", "Number 39: Utopia"],
  pokemon: ["Pikachu ex (SAR)", "Mew ex (UR)", "Umbreon VMAX (Alt)", "Rayquaza VMAX (Alt)", "Gardevoir ex", "Miraidon ex", "Giratina VSTAR", "Lugia V (Alt)", "Iono (SIR)", "Arven (SIR)", "Charizard VMAX (Rainbow)", "Moonbreon", "Lost Vacuum", "Roaring Moon ex", "Chien-Pao ex", "Squawkabilly ex", "Pidgeot ex", "Snorlax (Promo)"],
  lorcana: ["Mickey Mouse — Brave Little Tailor", "Maleficent — Monstrous Dragon", "Stitch — Rock Star", "Ariel — Spectacular Singer", "Belle — Strange but Special", "Gaston — Arrogant Hunter", "Scar — Fiery Usurper", "Mulan — Imperial Soldier", "Cinderella — Ballroom Sensation", "Aurora — Dreaming Guardian", "Hades — King of Olympus", "Ursula — Power Hungry", "Jafar — Wicked Sorcerer", "Tinker Bell — Giant Fairy", "Peter Pan — Never Landing", "Elsa — Ice Surfer", "Genie — On the Job", "Rapunzel — Gifted Artist"],
};

const RARITIES: Record<GameSlug, string[]> = {
  mtg: ["Mythic", "Rare", "Rare"],
  riftbound: ["Epic", "Rare", "Legendary"],
  yugioh: ["Secret Rare", "Ultra Rare", "Quarter Century Secret"],
  pokemon: ["Special Art Rare", "Ultra Rare", "Illustration Rare"],
  lorcana: ["Legendary", "Super Rare", "Enchanted"],
};

const SETS: Record<GameSlug, { name: string; code: string }[]> = {
  mtg: [{ name: "Modern Horizons 3", code: "MH3" }, { name: "Murders at Karlov Manor", code: "MKM" }, { name: "The Lord of the Rings", code: "LTR" }],
  riftbound: [{ name: "Origins", code: "OGN" }, { name: "Proving Grounds", code: "PVG" }],
  yugioh: [{ name: "Quarter Century Bonanza", code: "RA01" }, { name: "Phantom Nightmare", code: "PHNI" }, { name: "Age of Overlord", code: "AGOV" }],
  pokemon: [{ name: "Obsidian Flames", code: "OBF" }, { name: "Paldea Evolved", code: "PAL" }, { name: "151", code: "MEW" }],
  lorcana: [{ name: "The First Chapter", code: "TFC" }, { name: "Rise of the Floodborn", code: "ROF" }, { name: "Into the Inklands", code: "ITI" }],
};

function buildCatalog(): CardDef[] {
  const defs: CardDef[] = [...MARQUEE];
  for (const game of GAMES) {
    const pool = NAME_POOLS[game.slug];
    const sets = SETS[game.slug];
    const rarities = RARITIES[game.slug];
    const rng = seededRng("catalog-" + game.slug);
    // ~40 per game total including any marquee already added for this game.
    const already = defs.filter((d) => d.gameSlug === game.slug).length;
    const need = 40 - already;
    for (let i = 0; i < need; i++) {
      const name = pool[i % pool.length] + (i >= pool.length ? ` (v${Math.floor(i / pool.length) + 1})` : "");
      const set = sets[i % sets.length];
      const rarity = rarities[i % rarities.length];
      const roll = rng();
      const target = roll > 0.9 ? round2(45 + rng() * 160) : roll > 0.6 ? round2(12 + rng() * 40) : round2(1 + rng() * 12);
      const recentDrift = (rng() - 0.5) * 0.05; // ±2.5%/day recent bias
      defs.push({
        gameSlug: game.slug,
        name,
        setName: set.name,
        setCode: set.code,
        collectorNumber: String(10 + i),
        rarity,
        target,
        recentDrift,
      });
    }
  }
  return defs;
}

// ── Price-history generation ─────────────────────────────────────────────────
function genSeries(seed: string, target: number, recentDrift: number): number[] {
  const rng = seededRng(seed);
  const shape: number[] = [1];
  for (let i = 1; i < DAYS; i++) {
    const drift = i > DAYS - 8 ? recentDrift : 0;
    const step = drift + gaussian(rng) * 0.03;
    shape.push(Math.max(0.05, shape[i - 1] * (1 + step)));
  }
  const factor = target / shape[DAYS - 1];
  return shape.map((s) => round2(s * factor));
}

function genListings(seed: string, base: number): number[] {
  const rng = seededRng(seed + "-listings");
  let l = base;
  const out: number[] = [];
  for (let i = 0; i < DAYS; i++) {
    l = Math.max(6, l - Math.round(rng() * 6) + (rng() > 0.85 ? Math.round(rng() * 40) : 0));
    out.push(l);
  }
  return out;
}

interface RawPoint {
  marketplace: string;
  condition: string;
  priceType: string;
  price: number;
  currency: string;
  listingCount: number | null;
  capturedAt: Date;
}

function buildPoints(def: CardDef): { rows: RawPoint[]; statPoints: StatPoint[] } {
  const series = genSeries("px-" + def.name + def.setCode, def.target, def.recentDrift ?? 0);
  const listings = genListings("lc-" + def.name + def.setCode, def.gameSlug === "riftbound" ? 45 : 160);
  const markets = marketplacesForGame(def.gameSlug);
  const rows: RawPoint[] = [];
  const start = NOW.getTime() - (DAYS - 1) * DAY_MS;

  for (let i = 0; i < DAYS; i++) {
    rows.push({
      marketplace: "tcgplayer",
      condition: "NM",
      priceType: "market",
      price: series[i],
      currency: "USD",
      listingCount: listings[i],
      capturedAt: new Date(start + i * DAY_MS),
    });
  }
  const last = series[DAYS - 1];
  const lastAt = new Date(NOW.getTime() - 42 * 1000); // "42s ago"

  rows.push({ marketplace: "tcgplayer", condition: "NM", priceType: "low", price: round2(last * 0.96), currency: "USD", listingCount: listings[DAYS - 1], capturedAt: lastAt });
  rows.push({ marketplace: "tcgplayer", condition: "LP", priceType: "market", price: round2(last * CONDITION_MULTIPLIER.LP), currency: "USD", listingCount: Math.round(listings[DAYS - 1] * 0.3), capturedAt: lastAt });

  // Cross-market quotes get a short daily history (last 4 days), not just one
  // row at lastAt: as the seed ages past SPREAD_FRESHNESS_MS, yesterday's
  // points keep the spread scanner / card-page spreads alive. The freshest row
  // keeps today's exact ratios so the cached MarketStats (and the mockup
  // spread numbers) are unchanged.
  const xmRng = seededRng("xm-" + def.name + def.setCode);
  for (let i = DAYS - 4; i < DAYS; i++) {
    const freshest = i === DAYS - 1;
    const at = freshest ? lastAt : new Date(start + i * DAY_MS);
    const cmNoise = freshest ? 1 : 1 + (xmRng() - 0.5) * 0.03; // ±1.5% per day
    const ebNoise = freshest ? 1 : 1 + (xmRng() - 0.5) * 0.03;
    if (markets.includes("cardmarket")) {
      rows.push({ marketplace: "cardmarket", condition: "NM", priceType: "market", price: round2((series[i] * 0.94 * cmNoise) / 1.08), currency: "EUR", listingCount: Math.round(listings[i] * 1.4), capturedAt: at });
    }
    if (markets.includes("ebay")) {
      rows.push({ marketplace: "ebay", condition: "NM", priceType: "sold", price: round2(series[i] * 1.02 * ebNoise), currency: "USD", listingCount: 20 + (Math.round(series[i]) % 40), capturedAt: at });
    }
  }

  const statPoints: StatPoint[] = rows.map((r) => ({
    marketplace: r.marketplace as StatPoint["marketplace"],
    condition: r.condition as Condition,
    priceType: r.priceType as StatPoint["priceType"],
    price: r.price,
    currency: r.currency,
    listingCount: r.listingCount,
    capturedAt: r.capturedAt,
  }));
  return { rows, statPoints };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function reset() {
  await prisma.notificationLog.deleteMany();
  await prisma.tradeProposal.deleteMany();
  await prisma.alertRule.deleteMany();
  await prisma.watchlistItem.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.portfolio.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.magicLinkToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.marketStat.deleteMany();
  await prisma.pricePoint.deleteMany();
  await prisma.card.deleteMany();
  await prisma.game.deleteMany();
}

async function main() {
  console.log("⛏  Seeding FlipDeck…");
  await reset();

  // Games
  const gameIdBySlug = new Map<GameSlug, string>();
  for (const g of GAMES) {
    const row = await prisma.game.create({
      data: { slug: g.slug, name: g.name, icon: g.icon, accentColor: g.accentColor, dataQuality: g.dataQuality, sortOrder: g.sortOrder },
    });
    gameIdBySlug.set(g.slug, row.id);
  }

  // Cards + price history + stats
  const catalog = buildCatalog();
  const cardIdByName = new Map<string, string>();
  const currentPriceByCard = new Map<string, number>();
  const median90ByCard = new Map<string, number | null>();
  console.log(`   Creating ${catalog.length} cards with ${DAYS}d history…`);

  for (const def of catalog) {
    const card = await prisma.card.create({
      data: {
        gameId: gameIdBySlug.get(def.gameSlug)!,
        name: def.name,
        setName: def.setName,
        setCode: def.setCode,
        collectorNumber: def.collectorNumber,
        rarity: def.rarity,
        finish: def.finish ?? "nonfoil",
        language: "EN",
        imageUrl: def.imageUrl ?? null,
      },
    });
    cardIdByName.set(def.name, card.id);
    currentPriceByCard.set(card.id, def.target);

    const { rows, statPoints } = buildPoints(def);
    await prisma.pricePoint.createMany({ data: rows.map((r) => ({ ...r, cardId: card.id })) });

    const stat = computeMarketStat(statPoints, { now: NOW });
    if (stat) {
      await prisma.marketStat.create({ data: { cardId: card.id, ...stat } });
      median90ByCard.set(card.id, stat.median90d);
    }
  }

  // Demo user
  const user = await prisma.user.create({ data: { email: "demo@flipdeck.local", name: "Sam" } });
  await prisma.userSettings.create({
    data: {
      userId: user.id,
      defaultMarketplaces: toJson(DEFAULT_MARKETPLACE_BY_GAME),
      feeProfiles: toJson(DEFAULT_FEE_PROFILES),
      quietHoursEnabled: true,
      quietHoursStart: 1320,
      quietHoursEnd: 420,
      dailySpendCap: 500,
    },
  });
  const portfolio = await prisma.portfolio.create({ data: { userId: user.id, name: "Main binder" } });

  // Inventory — marquee holdings first, then fill to 60 across all games.
  const cid = (name: string) => cardIdByName.get(name)!;
  const price = (id: string) => currentPriceByCard.get(id) ?? 0;

  interface Holding {
    name: string;
    quantity: number;
    condition: Condition;
    costBasis: number;
    tags?: string;
    status?: "owned" | "listed";
    listedPrice?: number;
    location?: string;
  }
  const marqueeHoldings: Holding[] = [
    { name: "Ragavan, Nimble Pilferer", quantity: 1, condition: "NM", costBasis: 41, tags: "binder-A", location: "Binder A / p.3" },
    { name: "The Meathook Massacre", quantity: 2, condition: "NM", costBasis: 78, tags: "listed", status: "listed", listedPrice: 49.99 },
    { name: "Charizard ex (SAR)", quantity: 2, condition: "NM", costBasis: 150, tags: "graded?" },
    { name: "Jinx, Loose Cannon (Showcase)", quantity: 4, condition: "NM", costBasis: 16.5, tags: "spec,box-2" },
    { name: "Ash Blossom & Joyous Spring", quantity: 3, condition: "LP", costBasis: 32 },
    { name: "Elsa — Spirit of Winter", quantity: 1, condition: "NM", costBasis: 52, tags: "hold" },
    { name: "Sheoldred, the Apocalypse", quantity: 2, condition: "NM", costBasis: 60, tags: "binder-A" },
  ];

  const usedNames = new Set(marqueeHoldings.map((h) => h.name));
  for (const h of marqueeHoldings) {
    const cardId = cid(h.name);
    await prisma.inventoryItem.create({
      data: {
        portfolioId: portfolio.id,
        cardId,
        quantity: h.quantity,
        condition: h.condition,
        costBasis: h.costBasis,
        acquiredAt: new Date(NOW.getTime() - (30 + (h.quantity * 7)) * DAY_MS),
        location: h.location ?? null,
        tags: h.tags ?? "",
        status: h.status ?? "owned",
        listedPrice: h.listedPrice ?? null,
        listedMarketplace: h.status === "listed" ? "tcgplayer" : null,
      },
    });
  }

  // Fill remaining holdings to 60, spread across games, with varied P/L.
  const fillRng = seededRng("holdings");
  const conditions: Condition[] = ["NM", "NM", "NM", "LP", "MP"];
  const tagPool = ["binder-A", "binder-B", "spec", "hold", "box-2", ""];
  const fillCandidates = catalog.filter((d) => !usedNames.has(d.name));
  // round-robin games so every game is represented
  const byGame: Record<string, CardDef[]> = {};
  for (const d of fillCandidates) (byGame[d.gameSlug] ??= []).push(d);
  const order: CardDef[] = [];
  let added = true;
  const idx: Record<string, number> = {};
  while (added && order.length < 80) {
    added = false;
    for (const g of GAMES) {
      const list = byGame[g.slug] || [];
      const i = idx[g.slug] ?? 0;
      if (i < list.length) {
        order.push(list[i]);
        idx[g.slug] = i + 1;
        added = true;
      }
    }
  }
  for (const def of order) {
    if (usedNames.size >= 60) break;
    if (usedNames.has(def.name)) continue;
    usedNames.add(def.name);
    const cardId = cid(def.name);
    const cur = price(cardId);
    const factor = 0.45 + fillRng() * 0.95; // cost vs current → winners & losers
    await prisma.inventoryItem.create({
      data: {
        portfolioId: portfolio.id,
        cardId,
        quantity: 1 + Math.floor(fillRng() * 3),
        condition: conditions[Math.floor(fillRng() * conditions.length)],
        costBasis: round2(Math.max(0.5, cur * factor)),
        acquiredAt: new Date(NOW.getTime() - Math.floor(fillRng() * 120) * DAY_MS),
        tags: tagPool[Math.floor(fillRng() * tagPool.length)],
        status: "owned",
      },
    });
  }
  console.log(`   Inventory: ${usedNames.size} holdings.`);

  // A couple of sold items for realized P/L.
  for (const name of ["Sword of Fire and Ice", "Blue-Eyes White Dragon"]) {
    const id = cardIdByName.get(name);
    if (!id) continue;
    const cur = price(id);
    await prisma.inventoryItem.create({
      data: {
        portfolioId: portfolio.id,
        cardId: id,
        quantity: 1,
        condition: "NM",
        costBasis: round2(cur * 0.6),
        acquiredAt: new Date(NOW.getTime() - 80 * DAY_MS),
        status: "sold",
        soldPrice: round2(cur * 1.05),
        soldFees: round2(cur * 0.13),
        soldAt: new Date(NOW.getTime() - 6 * DAY_MS),
        tags: "sold",
      },
    });
  }

  // Watchlist
  const watch: { name: string; buy?: number; sell?: number; notes?: string }[] = [
    { name: "Elsa — Spirit of Winter", buy: 34, sell: 48, notes: "Dip buy target from rule" },
    { name: "Charizard ex (SAR)", sell: 200, notes: "Sell into the next Pokémon hype cycle" },
    { name: "The One Ring", buy: 40 },
    { name: "Snake-Eyes Ash", buy: 18 },
    { name: "Miraidon ex", buy: 12 },
    { name: "Yasuo, the Unforgiven", buy: 20, notes: "Riftbound beta data — watch closely" },
  ];
  for (const w of watch) {
    const id = cardIdByName.get(w.name);
    if (!id) continue;
    await prisma.watchlistItem.create({
      data: { userId: user.id, cardId: id, targetBuyPrice: w.buy ?? null, targetSellPrice: w.sell ?? null, notes: w.notes ?? null },
    });
  }

  // Alert rules (3, per the brief)
  const ruleSpike = await prisma.alertRule.create({
    data: {
      userId: user.id,
      name: "Sell into spikes",
      scope: "inventory",
      trigger: "pct_move",
      params: toJson({ windowHours: 24, movePct: 15, direction: "up" }),
      action: "propose_trade",
      proposeSide: "sell",
      quantity: 1,
      cooldownMinutes: 360,
      proposalExpiryMinutes: 30,
      quietHoursRespected: false,
      enabled: true,
    },
  });
  const ruleDip = await prisma.alertRule.create({
    data: {
      userId: user.id,
      name: "Dip buyer",
      scope: "watchlist",
      trigger: "pct_move",
      params: toJson({ windowHours: 48, movePct: 15, direction: "down" }),
      action: "propose_trade",
      proposeSide: "buy",
      quantity: 2,
      cooldownMinutes: 360,
      proposalExpiryMinutes: 30,
      quietHoursRespected: true,
      enabled: true,
    },
  });
  await prisma.alertRule.create({
    data: {
      userId: user.id,
      name: "Spread hunter ≥8%",
      scope: "inventory",
      trigger: "spread",
      params: toJson({ spreadPct: 8 }),
      action: "propose_trade",
      proposeSide: "buy",
      quantity: 1,
      cooldownMinutes: 720,
      proposalExpiryMinutes: 30,
      quietHoursRespected: true,
      enabled: true,
    },
  });

  // Two pending approvals (matching the mockups).
  const ragavanId = cid("Ragavan, Nimble Pilferer");
  const elsaId = cid("Elsa — Spirit of Winter");
  const ragavanPrice = price(ragavanId);
  const elsaPrice = price(elsaId);
  const tcgFee = DEFAULT_FEE_PROFILES.tcgplayer;

  const execSell = resolveExecution({ marketplace: "tcgplayer", side: "sell", card: { name: "Ragavan, Nimble Pilferer", setName: "Modern Horizons 2", setCode: "MH2", gameSlug: "mtg" } });
  const propRagavan = await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: ragavanId,
      ruleId: ruleSpike.id,
      side: "sell",
      quantity: 1,
      proposedPrice: ragavanPrice,
      marketplace: "tcgplayer",
      deepLink: execSell.url,
      executionMode: execSell.mode,
      rationale: "Sell into spikes — up ▲ +18.4% in 24h on TCGplayer, crossing your $68.00 target. Pro Tour result Jun 29 is the likely driver.",
      priceSnapshot: toJson({ price: ragavanPrice, delta24hPct: 18.4, delta7dPct: 31.2, target: 68 }),
      netAfterFees: netProceeds(ragavanPrice, 1, tcgFee).net,
      costBasis: 41,
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 13 * 60 * 1000),
    },
  });

  const execBuy = resolveExecution({ marketplace: "tcgplayer", side: "buy", card: { name: "Elsa — Spirit of Winter", setName: "The First Chapter", setCode: "TFC", gameSlug: "lorcana" } });
  const propElsa = await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: elsaId,
      ruleId: ruleDip.id,
      side: "buy",
      quantity: 2,
      proposedPrice: elsaPrice,
      marketplace: "tcgplayer",
      deepLink: execBuy.url,
      executionMode: execBuy.mode,
      rationale: "Dip buyer — down ▼ −16.2% in 48h; lowest listing in 90 days. 7-day sales velocity steady (no falling-knife signal).",
      priceSnapshot: toJson({ price: elsaPrice, delta48hPct: -16.2, median90d: 47.9 }),
      netAfterFees: buyEdge(elsaPrice, 2, 47.9, "tcgplayer").net,
      costBasis: null,
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 1000),
    },
  });

  // Three more staggered approvals (~2h / ~3.5h / ~6h) so the queue outlives
  // the two short-fuse mockup proposals instead of emptying within ~25 minutes.
  const sheoldredId = cid("Sheoldred, the Apocalypse");
  const sheoldredPrice = price(sheoldredId);
  const execSellSheoldred = resolveExecution({ marketplace: "tcgplayer", side: "sell", card: { name: "Sheoldred, the Apocalypse", setName: "Dominaria United", setCode: "DMU", gameSlug: "mtg" } });
  const propSheoldred = await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: sheoldredId,
      ruleId: ruleSpike.id,
      side: "sell",
      quantity: 1,
      proposedPrice: sheoldredPrice,
      marketplace: "tcgplayer",
      deepLink: execSellSheoldred.url,
      executionMode: execSellSheoldred.mode,
      rationale: "Sell into spikes — up ▲ +15.6% in 24h on TCGplayer. Standard B&R chatter is the likely driver; you hold 2 in Binder A at $60.00 cost.",
      priceSnapshot: toJson({ price: sheoldredPrice, delta24hPct: 15.6, delta7dPct: 4.2 }),
      netAfterFees: netProceeds(sheoldredPrice, 1, tcgFee).net,
      costBasis: 60,
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 2 * 3600 * 1000),
    },
  });

  const charizardSellId = cid("Charizard ex (SAR)");
  const charizardSellPrice = price(charizardSellId);
  const execSellCharizard = resolveExecution({ marketplace: "tcgplayer", side: "sell", card: { name: "Charizard ex (SAR)", setName: "Obsidian Flames", setCode: "OBF", gameSlug: "pokemon" } });
  const propCharizard = await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: charizardSellId,
      ruleId: ruleSpike.id,
      side: "sell",
      quantity: 1,
      proposedPrice: charizardSellPrice,
      marketplace: "tcgplayer",
      deepLink: execSellCharizard.url,
      executionMode: execSellCharizard.mode,
      rationale: "Sell into spikes — up ▲ +16.9% in 24h on TCGplayer as Pokémon hype builds, closing on your $200.00 sell target. You hold 2 @ $150.00 cost.",
      priceSnapshot: toJson({ price: charizardSellPrice, delta24hPct: 16.9, target: 200 }),
      netAfterFees: netProceeds(charizardSellPrice, 1, tcgFee).net,
      costBasis: 150,
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 3.5 * 3600 * 1000),
    },
  });

  const oneRingDef = catalog.find((d) => d.name === "The One Ring")!;
  const oneRingId = cid("The One Ring");
  const oneRingPrice = price(oneRingId);
  const oneRingMedian = median90ByCard.get(oneRingId) ?? round2(oneRingPrice * 1.1);
  const execBuyOneRing = resolveExecution({ marketplace: "tcgplayer", side: "buy", card: { name: oneRingDef.name, setName: oneRingDef.setName, setCode: oneRingDef.setCode, gameSlug: oneRingDef.gameSlug } });
  const propOneRing = await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: oneRingId,
      ruleId: ruleDip.id,
      side: "buy",
      quantity: 1,
      proposedPrice: oneRingPrice,
      marketplace: "tcgplayer",
      deepLink: execBuyOneRing.url,
      executionMode: execBuyOneRing.mode,
      rationale: `Dip buyer — down ▼ −12.4% in 48h, well under your $40.00 watch target. 90-day median $${oneRingMedian.toFixed(2)} leaves resell room after fees.`,
      priceSnapshot: toJson({ price: oneRingPrice, delta48hPct: -12.4, target: 40, median90d: oneRingMedian }),
      netAfterFees: buyEdge(oneRingPrice, 1, oneRingMedian, "tcgplayer").net,
      costBasis: null,
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 6 * 3600 * 1000),
    },
  });

  // Notification feed for the pending proposals.
  const pendingFeed = [
    { p: propRagavan, label: "Ragavan", sentMinAgo: 20 },
    { p: propElsa, label: "Elsa — Spirit of Winter", sentMinAgo: 20 },
    { p: propSheoldred, label: "Sheoldred, the Apocalypse", sentMinAgo: 12 },
    { p: propCharizard, label: "Charizard ex (SAR)", sentMinAgo: 8 },
    { p: propOneRing, label: "The One Ring", sentMinAgo: 4 },
  ];
  for (const { p, label, sentMinAgo } of pendingFeed) {
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        proposalId: p.id,
        ruleId: p.ruleId,
        kind: "proposal",
        channel: "console",
        title: `${p.side === "sell" ? "Sell" : "Buy"} proposal — ${label}`,
        body: `Propose ${p.side.toUpperCase()} ${p.quantity} @ $${p.proposedPrice.toFixed(2)}`,
        deepLink: `/alerts?proposal=${p.id}`,
        sentAt: new Date(NOW.getTime() - sentMinAgo * 60 * 1000),
        deliveredAt: new Date(NOW.getTime() - sentMinAgo * 60 * 1000),
      },
    });
  }

  // History: an approved+executed sell, an expired buy (with hindsight), a declined sell.
  const ashId = cid("Ash Blossom & Joyous Spring");
  const executed = await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: ashId,
      side: "sell",
      quantity: 1,
      proposedPrice: 47.35,
      marketplace: "tcgplayer",
      deepLink: execSell.url,
      executionMode: "deeplink",
      rationale: "Sell into spikes — up +12% in 24h.",
      priceSnapshot: toJson({ price: 47.35 }),
      netAfterFees: netProceeds(47.35, 1, tcgFee).net,
      costBasis: 32,
      status: "executed",
      createdAt: new Date(NOW.getTime() - 3 * 3600 * 1000),
      decidedAt: new Date(NOW.getTime() - 3 * 3600 * 1000 + 21000),
      executedAt: new Date(NOW.getTime() - 3 * 3600 * 1000 + 25000),
      expiresAt: new Date(NOW.getTime() - 3 * 3600 * 1000 + 30 * 60000),
    },
  });
  await prisma.notificationLog.create({
    data: { userId: user.id, proposalId: executed.id, kind: "proposal", channel: "console", title: "Approved — Ash Blossom sell at $47.35", body: "Acted in 21s from push. Opening TCGplayer listing.", sentAt: executed.decidedAt!, deliveredAt: executed.decidedAt!, actedOn: true, actedAt: executed.decidedAt! },
  });

  const charId = cid("Charizard ex (SAR)");
  await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: charId,
      side: "buy",
      quantity: 1,
      proposedPrice: 178,
      marketplace: "tcgplayer",
      deepLink: execBuy.url,
      executionMode: "deeplink",
      rationale: "Dip buyer — down −6% in 24h.",
      priceSnapshot: toJson({ price: 178 }),
      netAfterFees: buyEdge(178, 1, 190, "tcgplayer").net,
      status: "expired",
      createdAt: new Date(NOW.getTime() - 26 * 3600 * 1000),
      expiresAt: new Date(NOW.getTime() - 25.5 * 3600 * 1000),
      outcomePrice: 182,
      outcomeNote: "Hindsight: now $182.00 — buying then would have saved +$4.00 (+2.2%) per copy. Quiet hours held it.",
    },
  });
  await prisma.notificationLog.create({
    data: { userId: user.id, kind: "expiry", channel: "console", title: "Expired — Charizard ex buy at $178.00", body: "Quiet hours held it. Hindsight: now $182.00 (+2.2%).", sentAt: new Date(NOW.getTime() - 25.5 * 3600 * 1000), deliveredAt: null },
  });

  const meathookId = cid("The Meathook Massacre");
  await prisma.tradeProposal.create({
    data: {
      userId: user.id,
      cardId: meathookId,
      side: "sell",
      quantity: 1,
      proposedPrice: 46,
      marketplace: "tcgplayer",
      deepLink: execSell.url,
      executionMode: "deeplink",
      rationale: "Sell into spikes — brief +9% pop.",
      priceSnapshot: toJson({ price: 46 }),
      netAfterFees: netProceeds(46, 1, tcgFee).net,
      costBasis: 78,
      status: "declined",
      createdAt: new Date(NOW.getTime() - 30 * 3600 * 1000),
      decidedAt: new Date(NOW.getTime() - 29.8 * 3600 * 1000),
      expiresAt: new Date(NOW.getTime() - 29.5 * 3600 * 1000),
      outcomePrice: 47.2,
      outcomeNote: "Hindsight: now $47.20 — holding gained +$1.20 vs selling.",
    },
  });
  await prisma.notificationLog.create({
    data: { userId: user.id, kind: "hindsight", channel: "console", title: "Declined — Meathook Massacre sell at $46.00", body: "Hindsight: now $47.20 — declining gained +$1.20.", sentAt: new Date(NOW.getTime() - 29.8 * 3600 * 1000), deliveredAt: new Date(NOW.getTime() - 29.8 * 3600 * 1000), actedOn: true },
  });

  console.log("✅ Seed complete.");
  console.log("   Demo user: demo@flipdeck.local (auto-logged-in in dev)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
