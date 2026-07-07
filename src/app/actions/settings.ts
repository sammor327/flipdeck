"use server";

import { revalidatePath } from "next/cache";
import type { FeeProfile, GameSlug, Marketplace } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

export async function updateSettings(input: SettingsInput) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      quietHoursEnabled: input.quietHoursEnabled ?? true,
      quietHoursStart: input.quietHoursStart ?? 1320,
      quietHoursEnd: input.quietHoursEnd ?? 420,
      pushEnabled: input.pushEnabled ?? true,
      emailEnabled: input.emailEnabled ?? false,
      digestMode: input.digestMode ?? false,
      dailySpendCap: input.dailySpendCap ?? 500,
      killSwitch: input.killSwitch ?? false,
      defaultMarketplaces: toJson(input.defaultMarketplaces ?? {}),
      feeProfiles: toJson(input.feeProfiles ?? {}),
    },
    update: {
      quietHoursEnabled: input.quietHoursEnabled,
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
      pushEnabled: input.pushEnabled,
      emailEnabled: input.emailEnabled,
      digestMode: input.digestMode,
      dailySpendCap: input.dailySpendCap,
      killSwitch: input.killSwitch,
      defaultMarketplaces: input.defaultMarketplaces ? toJson(input.defaultMarketplaces) : undefined,
      feeProfiles: input.feeProfiles ? toJson(input.feeProfiles) : undefined,
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}
