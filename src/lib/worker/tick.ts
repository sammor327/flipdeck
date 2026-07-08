// The scheduled worker's unit of work. One tick:
//   1. pulls fresh quotes per card (provider, mock fallback) → appends PricePoints
//   2. recomputes the cached MarketStat
//   3. evaluates enabled alert rules against the dirty cards
//   4. fires TradeProposals + notifications for rules that trip (respecting cooldown)
//   5. expires stale pending proposals and records hindsight
//
// Everything the tick decides is delegated to the pure modules (stats, evaluate,
// fees, expiry) so this file is orchestration + I/O only.

import { prisma } from "../db";
import type { Condition, GameSlug, Marketplace, ProposeSide, RuleTrigger, Side } from "../constants";
import { DEFAULT_FEE_PROFILES } from "../constants";
import { evaluateRule } from "../alerts/evaluate";
import type { EvalContext, RuleParams } from "../alerts/types";
import { computeHindsight } from "../alerts/expiry";
import { buyEdge, netProceeds } from "../fees";
import { checkProposalGuardrails } from "../guardrails";
import { fromJson, toJson } from "../json";
import { HOUR_MS, minOver, moveOverWindow, round2, type PricePointLite } from "../math";
import { resolveExecution } from "../execution";
import { dispatchNotification } from "../notifications/dispatch";
import { providerFor, type ProviderQuote } from "../providers";
import { computeMarketStat, type StatPoint } from "../stats";
import { dirtyCards } from "../queue";
import { formatMoney, formatSignedMoney, formatDelta } from "../format";

type CardWithGame = Awaited<ReturnType<typeof loadCards>>[number];

function loadCards(where: object) {
  return prisma.card.findMany({ where, include: { game: true } });
}

function toProviderQuote(p: {
  marketplace: string;
  condition: string;
  priceType: string;
  price: number;
  currency: string;
  listingCount: number | null;
  capturedAt: Date;
}): ProviderQuote {
  return {
    marketplace: p.marketplace as Marketplace,
    condition: p.condition as Condition,
    priceType: p.priceType as ProviderQuote["priceType"],
    price: p.price,
    currency: p.currency,
    listingCount: p.listingCount,
    capturedAt: p.capturedAt,
  };
}

async function ingestCard(card: CardWithGame, now: Date): Promise<number> {
  const recent = await prisma.pricePoint.findMany({
    where: { cardId: card.id },
    orderBy: { capturedAt: "desc" },
    take: 12,
  });
  const provider = providerFor(card.game.slug as GameSlug);
  const quotes = await provider.fetchQuotes({
    id: card.id,
    gameSlug: card.game.slug as GameSlug,
    name: card.name,
    setCode: card.setCode,
    setName: card.setName,
    collectorNumber: card.collectorNumber,
    finish: card.finish,
    scryfallId: card.scryfallId,
    tcgplayerId: card.tcgplayerId,
    cardmarketId: card.cardmarketId,
    pokemonTcgId: card.pokemonTcgId,
    ygoprodeckId: card.ygoprodeckId,
    previous: recent.map(toProviderQuote),
  });
  if (quotes.length === 0) return 0;
  await prisma.pricePoint.createMany({
    data: quotes.map((q) => ({
      cardId: card.id,
      marketplace: q.marketplace,
      condition: q.condition,
      priceType: q.priceType,
      price: q.price,
      currency: q.currency,
      listingCount: q.listingCount ?? null,
      capturedAt: q.capturedAt ?? now,
    })),
  });
  return quotes.length;
}

export async function recomputeStat(cardId: string, now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - 95 * 24 * HOUR_MS);
  const rows = await prisma.pricePoint.findMany({
    where: { cardId, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
  });
  const points: StatPoint[] = rows.map((r) => ({
    marketplace: r.marketplace as Marketplace,
    condition: r.condition as Condition,
    priceType: r.priceType as StatPoint["priceType"],
    price: r.price,
    currency: r.currency,
    listingCount: r.listingCount,
    capturedAt: r.capturedAt,
  }));
  const stat = computeMarketStat(points, { now });
  if (!stat) return;
  await prisma.marketStat.upsert({
    where: { cardId },
    create: { cardId, ...stat },
    update: { ...stat },
  });
}

/** NM-market series (USD, tcgplayer) as the evaluator's price basis. */
async function primarySeries(cardId: string, now: Date): Promise<PricePointLite[]> {
  const since = new Date(now.getTime() - 95 * 24 * HOUR_MS);
  const rows = await prisma.pricePoint.findMany({
    where: { cardId, marketplace: "tcgplayer", condition: "NM", priceType: "market", capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
  });
  return rows.map((r) => ({ price: r.price, capturedAt: r.capturedAt, listingCount: r.listingCount }));
}

async function resolveRuleCardIds(rule: {
  scope: string;
  cardId: string | null;
  userId: string;
}): Promise<string[]> {
  if (rule.scope === "card") return rule.cardId ? [rule.cardId] : [];
  if (rule.scope === "watchlist") {
    const items = await prisma.watchlistItem.findMany({ where: { userId: rule.userId }, select: { cardId: true } });
    return items.map((i) => i.cardId);
  }
  // inventory
  const items = await prisma.inventoryItem.findMany({
    where: { portfolio: { userId: rule.userId }, status: { in: ["owned", "listed"] } },
    select: { cardId: true },
    distinct: ["cardId"],
  });
  return items.map((i) => i.cardId);
}

export interface TickResult {
  cards: number;
  quotesInserted: number;
  proposalsCreated: number;
  rulesEvaluated: number;
  expired: number;
}

export async function runTick(opts: { fastLaneOnly?: boolean } = {}): Promise<TickResult> {
  const now = new Date();

  // 1–2. Ingest + recompute stats.
  let cardWhere: object = {};
  if (opts.fastLaneOnly) {
    const rules = await prisma.alertRule.findMany({ where: { enabled: true }, select: { scope: true, cardId: true, userId: true } });
    const ids = new Set<string>();
    for (const r of rules) (await resolveRuleCardIds(r)).forEach((id) => ids.add(id));
    cardWhere = { id: { in: [...ids] } };
  }
  const cards = await loadCards(cardWhere);
  let quotesInserted = 0;
  for (const card of cards) {
    quotesInserted += await ingestCard(card, now);
    await recomputeStat(card.id, now);
    await dirtyCards.add(card.id);
  }

  // 3–4. Evaluate rules, fire proposals.
  const evaluated = await evaluateAllRules(now);

  // 5. Expire stale proposals.
  const expired = await expireStaleProposals(now);

  return {
    cards: cards.length,
    quotesInserted,
    proposalsCreated: evaluated.proposalsCreated,
    rulesEvaluated: evaluated.rulesEvaluated,
    expired,
  };
}

export async function evaluateAllRules(now = new Date()): Promise<{ rulesEvaluated: number; proposalsCreated: number }> {
  const rules = await prisma.alertRule.findMany({ where: { enabled: true } });
  let proposalsCreated = 0;

  for (const rule of rules) {
    try {
      const cardIds = await resolveRuleCardIds(rule);
      for (const cardId of cardIds) {
        const stat = await prisma.marketStat.findUnique({ where: { cardId } });
        if (!stat) continue;
        const series = await primarySeries(cardId, now);

        const ctx: EvalContext = {
          now,
          currentPrice: stat.currentPrice,
          moveOverHours: (hours) => moveOverWindow(series, hours * HOUR_MS, now),
          lowestOverDays: (days) => minOver(series, days, now),
          bestSpreadPct: stat.bestSpreadPct,
        };

        const result = evaluateRule(
          {
            trigger: rule.trigger as RuleTrigger,
            params: fromJson<RuleParams>(rule.params, {}),
            proposeSide: rule.proposeSide as ProposeSide,
            cooldownMinutes: rule.cooldownMinutes,
            lastFiredAt: rule.lastFiredAt,
            enabled: rule.enabled,
          },
          ctx
        );
        if (!result.fired || !result.side) continue;

        // Dedup: one live proposal per (rule, card).
        const existing = await prisma.tradeProposal.findFirst({
          where: { ruleId: rule.id, cardId, status: "pending" },
        });
        if (existing) continue;

        const created = await createProposal(rule, cardId, result.side, stat, result.reason ?? rule.name, result.evidence, now);
        if (created) proposalsCreated++;
      }
      // Mark the rule fired so its cooldown starts (only matters if it produced a proposal;
      // evaluateRule already gates on cooldown using lastFiredAt).
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[worker] rule ${rule.id} failed:`, err);
    }
  }
  return { rulesEvaluated: rules.length, proposalsCreated };
}

async function createProposal(
  rule: { id: string; userId: string; name: string; quantity: number; marketplace: string | null; action: string; proposalExpiryMinutes: number; quietHoursRespected: boolean },
  cardId: string,
  side: Side,
  stat: { currentPrice: number; median90d: number | null; delta24hPct: number | null; delta7dPct: number | null; bestSpreadPct: number | null; low90d: number | null; listingCount: number | null },
  reason: string,
  evidence: Record<string, string | number>,
  now: Date
) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { game: true } });
  if (!card) return null;

  // Safety guardrails (kill switch + daily spend cap). No settings row means no blocks.
  const settings = await prisma.userSettings.findUnique({ where: { userId: rule.userId } });

  const marketplace = (rule.marketplace as Marketplace) || "tcgplayer";
  const price = round2(stat.currentPrice);

  // Quantity: never propose selling more than the user holds.
  let quantity = Math.max(1, rule.quantity);
  let costBasis: number | null = null;
  if (side === "sell") {
    const holdings = await prisma.inventoryItem.findMany({
      where: { portfolio: { userId: rule.userId }, cardId, status: { in: ["owned", "listed"] } },
    });
    const owned = holdings.reduce((s, h) => s + h.quantity, 0);
    if (owned <= 0) return null;
    quantity = Math.min(quantity, owned);
    const totalCost = holdings.reduce((s, h) => s + h.costBasis * h.quantity, 0);
    costBasis = owned > 0 ? round2(totalCost / owned) : null;
  }

  // Spend already committed today: pending + approved buys created since server-local
  // midnight (the cap is a per-calendar-day limit in the server's timezone).
  let buysCommittedToday = 0;
  if (side === "buy") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todaysBuys = await prisma.tradeProposal.findMany({
      where: { userId: rule.userId, side: "buy", status: { in: ["pending", "approved"] }, createdAt: { gte: startOfToday } },
      select: { proposedPrice: true, quantity: true },
    });
    buysCommittedToday = todaysBuys.reduce((s, p) => s + p.proposedPrice * p.quantity, 0);
  }

  // Blocked fires create nothing and do NOT start the rule's cooldown (no lastFiredAt update).
  const guard = checkProposalGuardrails(settings, side, price * quantity, buysCommittedToday);
  if (guard.blocked) {
    // eslint-disable-next-line no-console
    console.log(`[worker] guardrail skipped ${side} proposal (rule "${rule.name}", ${card.name}): ${guard.reason}`);
    return null;
  }

  const fee = DEFAULT_FEE_PROFILES[marketplace];
  const netAfterFees =
    side === "sell"
      ? netProceeds(price, quantity, fee).net
      : buyEdge(price, quantity, stat.median90d ?? price, marketplace).net;

  const exec = resolveExecution({
    marketplace,
    side,
    card: { name: card.name, setName: card.setName, setCode: card.setCode, gameSlug: card.game.slug as GameSlug },
  });

  const expiresAt = new Date(now.getTime() + rule.proposalExpiryMinutes * 60000);

  const proposal = await prisma.tradeProposal.create({
    data: {
      userId: rule.userId,
      cardId,
      ruleId: rule.id,
      side,
      quantity,
      proposedPrice: price,
      marketplace,
      deepLink: exec.url,
      executionMode: exec.mode,
      rationale: `${rule.name} — ${reason}`,
      priceSnapshot: toJson({
        price,
        delta24hPct: stat.delta24hPct,
        delta7dPct: stat.delta7dPct,
        bestSpreadPct: stat.bestSpreadPct,
        low90d: stat.low90d,
        median90d: stat.median90d,
        ...evidence,
      }),
      netAfterFees,
      costBasis,
      status: "pending",
      expiresAt,
    },
  });

  await prisma.alertRule.update({ where: { id: rule.id }, data: { lastFiredAt: now } });

  if (rule.action === "propose_trade" || rule.action === "notify") {
    const delta = stat.delta24hPct ?? 0;
    const title = `${side === "sell" ? "Sell" : "Buy"} signal — ${card.name} ${formatDelta(delta, "percent")}`;
    const body = `Propose ${side.toUpperCase()} ${quantity} @ ${formatMoney(price)} · net after fees ${formatSignedMoney(netAfterFees)} · expires in ${rule.proposalExpiryMinutes} min`;
    await dispatchNotification({
      userId: rule.userId,
      title,
      body,
      deepLink: `${process.env.APP_URL || "http://localhost:3000"}/alerts?proposal=${proposal.id}`,
      kind: "proposal",
      proposalId: proposal.id,
      ruleId: rule.id,
      allowInQuietHours: !rule.quietHoursRespected,
    });
  }
  return proposal;
}

export async function expireStaleProposals(now = new Date()): Promise<number> {
  const stale = await prisma.tradeProposal.findMany({
    where: { status: "pending", expiresAt: { lte: now } },
    include: { card: { include: { marketStat: true } } },
  });
  for (const p of stale) {
    const current = p.card.marketStat?.currentPrice ?? p.proposedPrice;
    const h = computeHindsight(p.side as Side, p.proposedPrice, current);
    await prisma.tradeProposal.update({
      where: { id: p.id },
      data: { status: "expired", outcomePrice: current, outcomeNote: h.note },
    });
    await dispatchNotification({
      userId: p.userId,
      title: `Proposal expired — ${p.card.name}`,
      body: h.note,
      kind: "expiry",
      proposalId: p.id,
      deepLink: `${process.env.APP_URL || "http://localhost:3000"}/alerts`,
      allowInQuietHours: false,
    });
  }
  return stale.length;
}
