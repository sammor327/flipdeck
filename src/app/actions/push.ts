"use server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dispatchNotification } from "@/lib/notifications/dispatch";

export interface WebPushSubscriptionJSON {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function savePushSubscription(sub: WebPushSubscriptionJSON) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, error: "Invalid subscription" };
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

export async function sendTestNotification() {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  await dispatchNotification({
    userId: user.id,
    title: "FlipDeck test notification",
    body: "If you can read this, push (or the console fallback) is working.",
    kind: "info",
    deepLink: `${process.env.APP_URL || "http://localhost:3000"}/alerts`,
    allowInQuietHours: true,
  });
  return { ok: true };
}
