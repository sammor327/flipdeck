// The scheduled worker's unit of work. One tick:
//   1. pulls fresh quotes per card (provider, mock fallback) → appends PricePoints
//   2. recomputes the cached MarketStat
//   3. evaluates enabled alert rules
//   4. fires TradeProposals + notifications for rules that trip (respecting
//      cooldown); notify-only rules dispatch an info alert instead of a proposal
//   5. evaluates watchlist target prices (buy/sell targets fire the same way)
//   6. expires stale pending proposals and records hindsight
//   7. records hindsight for declined proposals whose horizon has passed
//
// Everything the tick decides is delegated to the pure modules (stats, evaluate,
// fees, expiry) so this file is orchestration + I/O only.

import { prisma } from "../db";
import type { Condition, GameSlug, Marketplace, ProposeSide, RuleTrigger, Side } from "../constants";
import { evaluateRule } from "../alerts/evaluate";
import type { EvalContext, RuleParams } from "../alerts/types";
import { computeHindsight } from "../alerts/expiry";
import { buyEdge, netProceeds } from "../fees";
import { mergeFeeProfiles } from "../feeProfiles";
import { checkProposalGuardrails } from "../guardrails";
import { fromJson, toJson } from "../json";
import { HOUR_MS, minOver, moveOverWindow, round2, type PricePointLite } from "../math";
import { resolveExecution } from "../execution";
import { dispatchNotification } from "../notifications/dispatch";
import { providerFor, type ProviderQuote } from "../providers";
import { userBestSpreads, type UserSpread } from "../spreads";
import { computeMarketStat, SPREAD_FRESHNESS_MS, type StatPoint } from "../stats";
import { evaluateWatchTarget } from "../watchTargets";
import { fastLaneCardIds, resolveRuleCardIds } from "../fastLane";
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

export interface TickResult {
  cards: number;
  quotesInserted: number;
  proposalsCreated: number;
  rulesEvaluated: number;
  expired: number;
  hindsights: number;
}

// Single-flight guard. runTick is reachable from three entry points — the
// standalone loop (run.ts), the simulateTick server action, and
// POST /api/worker/tick — with nothing stopping them from overlapping in one
// process. A call that arrives while a tick is in flight coalesces onto the
// running tick's promise instead of starting a second one. Coalescing ignores
// `fastLaneOnly`: a fast-lane request that joins a full tick gets a superset of
// the work (and vice versa gets the fast lane's subset), which is an acceptable
// trade for never running two ticks at once. Cross-process overlap (standalone
// worker vs. web process) is handled by the DB-level claims below, not here.
let inFlight: Promise<TickResult> | null = null;

export function runTick(opts: { fastLaneOnly?: boolean } = {}): Promise<TickResult> {
  if (inFlight) return inFlight;
  inFlight = runTickBody(opts).finally(() => {
    // Reset in a finally so a rejected tick can't wedge the guard forever.
    inFlight = null;
  });
  return inFlight;
}

async function runTickBody(opts: { fastLaneOnly?: boolean } = {}): Promise<TickResult> {
  const now = new Date();

  // 1–2. Ingest + recompute stats. Each card is isolated: one card whose
  // provider fetch or DB write throws must not abort the tick (rules, watch
  // targets, expiry, and hindsight sweeps below still need to run).
  let cardWhere: object = {};
  if (opts.fastLaneOnly) {
    cardWhere = { id: { in: [...(await fastLaneCardIds())] } };
  }
  const cards = await loadCards(cardWhere);
  let quotesInserted = 0;
  for (const card of cards) {
    try {
      quotesInserted += await ingestCard(card, now);
      await recomputeStat(card.id, now);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[worker] card ${card.id} ingest failed:`, err);
    }
  }

  // 3–4. Evaluate rules, fire proposals.
  const evaluated = await evaluateAllRules(now);

  // 5. Evaluate watchlist target prices.
  const watchProposals = await evaluateWatchTargets(now);

  // 6. Expire stale proposals.
  const expired = await expireStaleProposals(now);

  // 7. Record hindsight for declined proposals past their horizon.
  const hindsights = await recordDeclinedHindsight(now);

  return {
    cards: cards.length,
    quotesInserted,
    proposalsCreated: evaluated.proposalsCreated + watchProposals,
    rulesEvaluated: evaluated.rulesEvaluated,
    expired,
    hindsights,
  };
}

export async function evaluateAllRules(now = new Date()): Promise<{ rulesEvaluated: number; proposalsCreated: number }> {
  const rules = await prisma.alertRule.findMany({ where: { enabled: true } });
  let proposalsCreated = 0;

  // Fee-profile overrides (UserSettings.feeProfiles JSON) loaded once per rule
  // owner — spread rules need them, and one user often has several rules.
  const feeProfilesByUser = new Map<string, string | null>();

  for (const rule of rules) {
    try {
      const cardIds = await resolveRuleCardIds(rule);

      // Conditional cooldown claim. The in-process single-flight guard cannot
      // cover two processes (standalone worker + a web-process simulateTick)
      // racing the same rule, so before any fire we compare-and-set
      // lastFiredAt at the DB: only the actor whose update matches the value
      // it read at evaluation time (null for never-fired rules — Prisma
      // matches that correctly) wins the fire; a lost claim means the other
      // actor's fire stands. `claimToken` starts at the evaluation read and
      // advances to `now` on a win so a multi-card rule keeps firing within
      // this tick exactly as before.
      let claimToken = rule.lastFiredAt;
      const claimCooldown = async (): Promise<boolean> => {
        const claim = await prisma.alertRule.updateMany({
          where: { id: rule.id, lastFiredAt: claimToken },
          data: { lastFiredAt: now },
        });
        if (claim.count === 0) return false;
        claimToken = now;
        return true;
      };

      // Spread rules evaluate the OWNER's after-fee spread, not the cached
      // MarketStat.bestSpreadPct (computeMarketStat derives that with
      // DEFAULT_FEE_PROFILES). Mirrors the read surfaces (userSpreadMap in
      // queries.ts): one batched query over fresh NM market|sold quotes, then
      // userBestSpreads under the owner's merged profiles. Cards with fewer
      // than two fresh marketplaces are absent from the map → null → no fire,
      // exactly like the spread scanner. Other triggers never read
      // bestSpreadPct, so they keep the cached value.
      let userSpreads: Map<string, UserSpread> | null = null;
      if (rule.trigger === "spread" && cardIds.length > 0) {
        if (!feeProfilesByUser.has(rule.userId)) {
          const settings = await prisma.userSettings.findUnique({ where: { userId: rule.userId } });
          feeProfilesByUser.set(rule.userId, settings?.feeProfiles ?? null);
        }
        const points = await prisma.pricePoint.findMany({
          where: {
            cardId: { in: cardIds },
            condition: "NM",
            priceType: { in: ["market", "sold"] },
            capturedAt: { gte: new Date(now.getTime() - SPREAD_FRESHNESS_MS) },
          },
          select: { cardId: true, marketplace: true, price: true, currency: true, priceType: true, capturedAt: true },
        });
        userSpreads = userBestSpreads(
          points.map((p) => ({ ...p, marketplace: p.marketplace as Marketplace })),
          mergeFeeProfiles(feeProfilesByUser.get(rule.userId)),
          { now }
        );
      }

      for (const cardId of cardIds) {
        const stat = await prisma.marketStat.findUnique({ where: { cardId } });
        if (!stat) continue;
        const series = await primarySeries(cardId, now);

        const ctx: EvalContext = {
          now,
          currentPrice: stat.currentPrice,
          moveOverHours: (hours) => moveOverWindow(series, hours * HOUR_MS, now),
          lowestOverDays: (days) => minOver(series, days, now),
          bestSpreadPct: userSpreads ? (userSpreads.get(cardId)?.netPct ?? null) : stat.bestSpreadPct,
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

        // Notify-only rules alert and start the cooldown — no proposal, no
        // guardrails, no holdings gate (a sell alert on a card the user holds
        // zero of must still notify). dispatchNotification itself holds
        // delivery under the kill switch / quiet hours.
        if (rule.action === "notify") {
          const card = await prisma.card.findUnique({ where: { id: cardId }, select: { name: true } });
          if (!card) continue;
          // Claim the cooldown before dispatching — a lost claim means another
          // process already fired this rule, so send nothing. A won claim
          // starts the cooldown: the lastFiredAt gate in evaluateRule is what
          // keeps notify rules from spamming.
          if (!(await claimCooldown())) continue;
          await dispatchNotification({
            userId: rule.userId,
            title: `Alert — ${card.name} ${formatDelta(stat.delta24hPct ?? 0, "percent")}`,
            body: `${result.reason ?? rule.name} · current price ${formatMoney(stat.currentPrice)}`,
            deepLink: `${process.env.APP_URL || "http://localhost:3000"}/cards/${cardId}`,
            kind: "info",
            ruleId: rule.id,
            allowInQuietHours: !rule.quietHoursRespected,
          });
          continue;
        }

        // Dedup: one live proposal per (rule, card).
        const existing = await prisma.tradeProposal.findFirst({
          where: { ruleId: rule.id, cardId, status: "pending" },
        });
        if (existing) continue;

        const created = await createProposal(rule, cardId, result.side, stat, result.reason ?? rule.name, result.evidence, now, claimCooldown);
        if (created) proposalsCreated++;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[worker] rule ${rule.id} failed:`, err);
    }
  }
  return { rulesEvaluated: rules.length, proposalsCreated };
}

// Watch targets have no AlertRule row to carry a cooldown, so they mirror the
// rule defaults: skip while a target-fired proposal for the same (user, card,
// side) is pending or was created within the last 360 minutes.
const WATCH_TARGET_COOLDOWN_MINUTES = 360;
const WATCH_TARGET_EXPIRY_MINUTES = 30;

/**
 * Evaluate every watchlist item with a target price against its cached
 * MarketStat and fire ruleId-null TradeProposals (plus notifications) for hits.
 * Guardrails (kill switch, daily spend cap) apply exactly as for rule fires.
 * Returns the number of proposals created.
 */
export async function evaluateWatchTargets(now = new Date()): Promise<number> {
  const items = await prisma.watchlistItem.findMany({
    where: { OR: [{ targetBuyPrice: { not: null } }, { targetSellPrice: { not: null } }] },
    include: { card: { include: { game: true, marketStat: true } } },
  });
  let proposalsCreated = 0;

  for (const item of items) {
    try {
      const stat = item.card.marketStat;
      if (!stat) continue;

      // Holdings gate the sell side (zero holdings → skip, no notification)
      // and cap the sell quantity below.
      const holdings = await prisma.inventoryItem.findMany({
        where: { portfolio: { userId: item.userId }, cardId: item.cardId, status: { in: ["owned", "listed"] } },
      });
      const owned = holdings.reduce((s, h) => s + h.quantity, 0);

      const hit = evaluateWatchTarget(item, stat.currentPrice, owned > 0);
      if (!hit) continue;
      const side = hit.side;

      // Dedup/cooldown without a schema change: one live or recent target-fired
      // proposal per (user, card, side).
      const cooldownStart = new Date(now.getTime() - WATCH_TARGET_COOLDOWN_MINUTES * 60000);
      const existing = await prisma.tradeProposal.findFirst({
        where: {
          userId: item.userId,
          cardId: item.cardId,
          side,
          ruleId: null,
          OR: [{ status: "pending" }, { createdAt: { gte: cooldownStart } }],
        },
      });
      if (existing) continue;

      // Safety guardrails (kill switch + daily spend cap), same as rule fires.
      const settings = await prisma.userSettings.findUnique({ where: { userId: item.userId } });
      const price = round2(stat.currentPrice);

      let quantity = 1;
      let costBasis: number | null = null;
      if (side === "sell") {
        quantity = Math.min(quantity, owned);
        const totalCost = holdings.reduce((s, h) => s + h.costBasis * h.quantity, 0);
        costBasis = owned > 0 ? round2(totalCost / owned) : null;
      }

      const buysCommittedToday = side === "buy" ? await buysCommittedTodayFor(item.userId, now) : 0;
      const guard = checkProposalGuardrails(settings, side, price * quantity, buysCommittedToday);
      if (guard.blocked) {
        // eslint-disable-next-line no-console
        console.log(`[worker] guardrail skipped ${side} proposal (watch target, ${item.card.name}): ${guard.reason}`);
        continue;
      }

      const marketplace: Marketplace = "tcgplayer";
      const profiles = mergeFeeProfiles(settings?.feeProfiles);
      const fee = profiles[marketplace];
      const netAfterFees =
        side === "sell"
          ? netProceeds(price, quantity, fee).net
          : buyEdge(price, quantity, stat.median90d ?? price, marketplace, profiles).net;

      const exec = resolveExecution({
        marketplace,
        side,
        card: { name: item.card.name, setName: item.card.setName, setCode: item.card.setCode, gameSlug: item.card.game.slug as GameSlug },
      });

      const proposal = await prisma.tradeProposal.create({
        data: {
          userId: item.userId,
          cardId: item.cardId,
          ruleId: null,
          side,
          quantity,
          proposedPrice: price,
          marketplace,
          deepLink: exec.url,
          executionMode: exec.mode,
          rationale: hit.reason,
          priceSnapshot: toJson({
            price,
            delta24hPct: stat.delta24hPct,
            delta7dPct: stat.delta7dPct,
            bestSpreadPct: stat.bestSpreadPct,
            low90d: stat.low90d,
            median90d: stat.median90d,
            targetBuyPrice: item.targetBuyPrice,
            targetSellPrice: item.targetSellPrice,
          }),
          netAfterFees,
          costBasis,
          status: "pending",
          expiresAt: new Date(now.getTime() + WATCH_TARGET_EXPIRY_MINUTES * 60000),
        },
      });
      proposalsCreated++;

      const delta = stat.delta24hPct ?? 0;
      const title = `${side === "sell" ? "Sell" : "Buy"} signal — ${item.card.name} ${formatDelta(delta, "percent")}`;
      const body = `Propose ${side.toUpperCase()} ${quantity} @ ${formatMoney(price)} · net after fees ${formatSignedMoney(netAfterFees)} · expires in ${WATCH_TARGET_EXPIRY_MINUTES} min`;
      await dispatchNotification({
        userId: item.userId,
        title,
        body,
        deepLink: `${process.env.APP_URL || "http://localhost:3000"}/alerts?proposal=${proposal.id}`,
        kind: "proposal",
        proposalId: proposal.id,
        allowInQuietHours: false,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[worker] watch target ${item.id} failed:`, err);
    }
  }
  return proposalsCreated;
}

/**
 * Spend already committed today: pending + approved buys created since
 * server-local midnight (the cap is a per-calendar-day limit in the server's
 * timezone). Shared by rule-fired and watch-target-fired proposals.
 */
async function buysCommittedTodayFor(userId: string, now: Date): Promise<number> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todaysBuys = await prisma.tradeProposal.findMany({
    where: { userId, side: "buy", status: { in: ["pending", "approved"] }, createdAt: { gte: startOfToday } },
    select: { proposedPrice: true, quantity: true },
  });
  return todaysBuys.reduce((s, p) => s + p.proposedPrice * p.quantity, 0);
}

/**
 * Fire a propose_trade rule: guardrails, holdings gate, cooldown claim,
 * proposal + notification. `claim` is the caller's conditional lastFiredAt
 * compare-and-set (see evaluateAllRules); it runs strictly AFTER the guardrail
 * check so blocked fires never consume the rule's cooldown, and strictly BEFORE
 * the create so a lost claim (another process fired first) creates nothing.
 */
async function createProposal(
  rule: { id: string; userId: string; name: string; quantity: number; marketplace: string | null; proposalExpiryMinutes: number; quietHoursRespected: boolean },
  cardId: string,
  side: Side,
  stat: { currentPrice: number; median90d: number | null; delta24hPct: number | null; delta7dPct: number | null; bestSpreadPct: number | null; low90d: number | null; listingCount: number | null },
  reason: string,
  evidence: Record<string, string | number>,
  now: Date,
  claim: () => Promise<boolean>
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

  const buysCommittedToday = side === "buy" ? await buysCommittedTodayFor(rule.userId, now) : 0;

  // Blocked fires create nothing and do NOT start the rule's cooldown (they
  // return before the claim below ever touches lastFiredAt).
  const guard = checkProposalGuardrails(settings, side, price * quantity, buysCommittedToday);
  if (guard.blocked) {
    // eslint-disable-next-line no-console
    console.log(`[worker] guardrail skipped ${side} proposal (rule "${rule.name}", ${card.name}): ${guard.reason}`);
    return null;
  }

  // Conditional cooldown claim: losing it means another process fired this
  // rule between our evaluation read and here — create nothing, notify nobody.
  if (!(await claim())) return null;

  const profiles = mergeFeeProfiles(settings?.feeProfiles);
  const fee = profiles[marketplace];
  const netAfterFees =
    side === "sell"
      ? netProceeds(price, quantity, fee).net
      : buyEdge(price, quantity, stat.median90d ?? price, marketplace, profiles).net;

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
  return proposal;
}

export async function expireStaleProposals(now = new Date()): Promise<number> {
  const stale = await prisma.tradeProposal.findMany({
    where: { status: "pending", expiresAt: { lte: now } },
    include: { card: { include: { marketStat: true } } },
  });
  let expired = 0;
  for (const p of stale) {
    const current = p.card.marketStat?.currentPrice ?? p.proposedPrice;
    const h = computeHindsight(p.side as Side, p.proposedPrice, current);
    // Guarded claim: only flip rows still pending, so the sweep can never
    // clobber a proposal approved/declined since the findMany above (whose
    // inventory effects were already applied).
    const claim = await prisma.tradeProposal.updateMany({
      where: { id: p.id, status: "pending" },
      data: { status: "expired", outcomePrice: current, outcomeNote: h.note },
    });
    if (claim.count === 0) continue;
    expired += claim.count;
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
  return expired;
}

/**
 * Record hindsight for declined proposals whose natural horizon (expiresAt)
 * has passed — the "you missed / you dodged" note the History tab shows.
 * Hindsight is measured at expiresAt rather than at decline time so it answers
 * the same question the expiry sweep does: what happened over the window the
 * proposal was live for. The undoUntil guard keeps the sweep from racing a
 * live 5-second undo (declineProposal sets undoUntil = decidedAt +
 * UNDO_WINDOW_MS and never nulls it after the window lapses, so the lte-now
 * branch is what admits settled declines).
 */
export async function recordDeclinedHindsight(now = new Date()): Promise<number> {
  const declined = await prisma.tradeProposal.findMany({
    where: {
      status: "declined",
      outcomeNote: null,
      expiresAt: { lte: now },
      OR: [{ undoUntil: null }, { undoUntil: { lte: now } }],
    },
    include: { card: { include: { marketStat: true } } },
  });
  let hindsights = 0;
  for (const p of declined) {
    const current = p.card.marketStat?.currentPrice ?? p.proposedPrice;
    const h = computeHindsight(p.side as Side, p.proposedPrice, current);
    // Guarded claim: only note rows still declined and un-noted, so a proposal
    // undone back to pending (or already noted by a concurrent sweep) since
    // the findMany above is left alone and the hindsight notification fires
    // exactly once per proposal.
    const claim = await prisma.tradeProposal.updateMany({
      where: { id: p.id, status: "declined", outcomeNote: null },
      data: { outcomePrice: current, outcomeNote: h.note },
    });
    if (claim.count === 0) continue;
    hindsights += claim.count;
    await dispatchNotification({
      userId: p.userId,
      title: `Hindsight — ${p.card.name}`,
      body: h.note,
      kind: "hindsight",
      proposalId: p.id,
      deepLink: `${process.env.APP_URL || "http://localhost:3000"}/alerts`,
      allowInQuietHours: false,
    });
  }
  return hindsights;
}
