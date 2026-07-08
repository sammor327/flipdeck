"use server";

import { revalidatePath } from "next/cache";
import type { FeeProfile, GameSlug, Marketplace } from "@/lib/constants";
import { GAMES, MARKETPLACES } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeFeeProfileOverrides } from "@/lib/feeProfiles";
import { toJson } from "@/lib/json";

export interface SettingsInput {
  quietHoursEnabled?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  digestMode?: boolean;
  dailySpendCap?: number;
  killSwitch?: boolean;
  defaultMarketplaces?: Partial<Record<GameSlug, Marketplace>>;
  feeProfiles?: Partial<Record<Marketplace, FeeProfile>>;
}

// Server actions receive client-crafted payloads, so nothing here is trusted:
// numbers are validated/clamped, booleans coerced with `=== true`, and the two
// JSON maps are whitelisted against the known games/marketplaces before they
// are persisted.

/** Only a literal `true` persists as true; null/undefined stays undefined (Prisma "leave unchanged"). */
function asBool(value: boolean | undefined): boolean | undefined {
  return value == null ? undefined : value === true;
}

/** Clamp a quiet-hours value to an integer minute-of-day in [0, 1439]; non-finite input is ignored. */
function clampMinutes(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(1439, Math.max(0, Math.floor(value)));
}

/** Keep only known GameSlug → Marketplace pairs; unknown games or marketplaces are dropped. */
function sanitizeDefaultMarketplaces(input: unknown): Partial<Record<GameSlug, Marketplace>> {
  const out: Partial<Record<GameSlug, Marketplace>> = {};
  if (typeof input !== "object" || input == null) return out;
  for (const g of GAMES) {
    const candidate = (input as Record<string, unknown>)[g.slug];
    if (typeof candidate === "string" && MARKETPLACES.some((m) => m.id === candidate)) {
      out[g.slug] = candidate as Marketplace;
    }
  }
  return out;
}

export async function updateSettings(input: SettingsInput) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (input.dailySpendCap != null && (!Number.isFinite(input.dailySpendCap) || input.dailySpendCap < 0)) {
    return { ok: false, error: "Enter a valid daily spend cap" };
  }
  const quietHoursStart = clampMinutes(input.quietHoursStart);
  const quietHoursEnd = clampMinutes(input.quietHoursEnd);
  const defaultMarketplaces = input.defaultMarketplaces ? sanitizeDefaultMarketplaces(input.defaultMarketplaces) : undefined;
  const feeProfiles = input.feeProfiles ? sanitizeFeeProfileOverrides(input.feeProfiles) : undefined;
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      quietHoursEnabled: asBool(input.quietHoursEnabled) ?? true,
      quietHoursStart: quietHoursStart ?? 1320,
      quietHoursEnd: quietHoursEnd ?? 420,
      pushEnabled: asBool(input.pushEnabled) ?? true,
      emailEnabled: asBool(input.emailEnabled) ?? false,
      digestMode: asBool(input.digestMode) ?? false,
      dailySpendCap: input.dailySpendCap ?? 500,
      killSwitch: asBool(input.killSwitch) ?? false,
      defaultMarketplaces: toJson(defaultMarketplaces ?? {}),
      feeProfiles: toJson(feeProfiles ?? {}),
    },
    update: {
      quietHoursEnabled: asBool(input.quietHoursEnabled),
      quietHoursStart,
      quietHoursEnd,
      pushEnabled: asBool(input.pushEnabled),
      emailEnabled: asBool(input.emailEnabled),
      digestMode: asBool(input.digestMode),
      dailySpendCap: input.dailySpendCap,
      killSwitch: asBool(input.killSwitch),
      defaultMarketplaces: defaultMarketplaces ? toJson(defaultMarketplaces) : undefined,
      feeProfiles: feeProfiles ? toJson(feeProfiles) : undefined,
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}
