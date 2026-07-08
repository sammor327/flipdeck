"use server";

import { revalidatePath } from "next/cache";
import type { RuleParams } from "@/lib/alerts/types";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/json";
import { HOUR_MS, minOver, moveOverWindow, type PricePointLite } from "@/lib/math";
import { validateRuleInput, type CreateRuleInput } from "@/lib/ruleValidation";

export type { CreateRuleInput } from "@/lib/ruleValidation";

function buildParams(input: CreateRuleInput): RuleParams {
  switch (input.trigger) {
    case "threshold_above":
    case "threshold_below":
      return { threshold: input.threshold };
    case "pct_move":
      return { windowHours: input.windowHours ?? 24, movePct: input.movePct ?? 15, direction: input.direction ?? "either" };
    case "spread":
      return { spreadPct: input.spreadPct ?? 8 };
    case "new_low":
      return { lookbackDays: input.lookbackDays ?? 90 };
    default:
      return {};
  }
}

export async function createRule(input: CreateRuleInput) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const validated = validateRuleInput(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const v = validated.value;
  const rule = await prisma.alertRule.create({
    data: {
      userId: user.id,
      name: v.name,
      scope: v.scope,
      cardId: v.scope === "card" ? v.cardId ?? null : null,
      trigger: v.trigger,
      params: toJson(buildParams(v)),
      action: v.action ?? "propose_trade",
      proposeSide: v.proposeSide ?? "auto",
      quantity: v.quantity ?? 1,
      marketplace: v.marketplace ?? null,
      cooldownMinutes: v.cooldownMinutes ?? 360,
      proposalExpiryMinutes: v.proposalExpiryMinutes ?? 30,
      quietHoursRespected: v.quietHoursRespected ?? true,
      enabled: true,
    },
  });
  revalidatePath("/alerts");
  if (v.cardId) revalidatePath(`/cards/${v.cardId}`);
  return { ok: true, id: rule.id };
}

export async function toggleRule(id: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const rule = await prisma.alertRule.findFirst({ where: { id, userId: user.id } });
  if (!rule) return { ok: false, error: "Not found" };
  await prisma.alertRule.update({ where: { id }, data: { enabled: !rule.enabled } });
  revalidatePath("/alerts");
  return { ok: true, enabled: !rule.enabled };
}

export async function deleteRule(id: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  await prisma.alertRule.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/alerts");
  return { ok: true };
}

/** Lightweight backtest over a single card's 90-day history. */
export async function backtestRule(input: CreateRuleInput): Promise<{ fires: number; note: string }> {
  if (!input.cardId) return { fires: 0, note: "Backtest needs a specific card." };
  const rows = await prisma.pricePoint.findMany({
    where: { cardId: input.cardId, marketplace: "tcgplayer", condition: "NM", priceType: "market" },
    orderBy: { capturedAt: "asc" },
  });
  const series: PricePointLite[] = rows.map((r) => ({ price: r.price, capturedAt: r.capturedAt }));
  if (series.length < 3) return { fires: 0, note: "Not enough history to backtest." };

  const p = buildParams(input);
  let fires = 0;
  for (let i = 1; i < series.length; i++) {
    const now = series[i].capturedAt;
    const upto = series.slice(0, i + 1);
    if (input.trigger === "pct_move") {
      const m = moveOverWindow(upto, (p.windowHours ?? 24) * HOUR_MS, now);
      if (m != null) {
        const need = Math.abs(p.movePct ?? 15);
        const dir = p.direction ?? "either";
        const ok = Math.abs(m) >= need && (dir === "either" || (dir === "up" && m > 0) || (dir === "down" && m < 0));
        if (ok) fires++;
      }
    } else if (input.trigger === "threshold_above") {
      if (series[i].price >= (p.threshold ?? Infinity) && series[i - 1].price < (p.threshold ?? Infinity)) fires++;
    } else if (input.trigger === "threshold_below") {
      if (series[i].price <= (p.threshold ?? -Infinity) && series[i - 1].price > (p.threshold ?? -Infinity)) fires++;
    } else if (input.trigger === "new_low") {
      const low = minOver(series.slice(0, i), p.lookbackDays ?? 90, now);
      if (low != null && series[i].price <= low) fires++;
    }
  }
  const note =
    input.trigger === "spread"
      ? "Spread rules can't be backtested from single-card history."
      : `Would have fired ${fires}× in the last 90 days.`;
  return { fires, note };
}
