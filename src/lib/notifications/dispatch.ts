// Notification dispatcher: the one place that decides channel, honors quiet
// hours + user prefs, delivers, and records a NotificationLog. Used by both the
// worker (rule fires) and server actions (expiry hindsight, etc).

import type { NotificationChannel } from "../constants";
import { prisma } from "../db";
import { consoleChannel } from "./console";
import { isQuietHours } from "./quietHours";
import type { NotifyInput, PushPayload } from "./types";
import { webPushChannel } from "./webpush";

/** Channel select: Web Push when configured and the user hasn't opted out. */
export function channelFor(settings: { pushEnabled: boolean } | null): NotificationChannel {
  return webPushChannel.isConfigured() && (settings?.pushEnabled ?? true) ? "webpush" : "console";
}

/**
 * Deliver one payload to a user over their selected channel. Every push
 * subscription is attempted; with none registered (or push disabled/keyless)
 * the console channel is the guaranteed fallback. Shared by
 * dispatchNotification and the quiet-hours flush.
 */
export async function deliverToUser(
  userId: string,
  settings: { pushEnabled: boolean } | null,
  payload: PushPayload
): Promise<{ channel: NotificationChannel; delivered: boolean }> {
  const channel = channelFor(settings);
  let delivered = false;
  if (channel === "webpush") {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    for (const s of subs) {
      const ok = await webPushChannel.deliver({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
      delivered = delivered || ok;
    }
    if (subs.length === 0) {
      // No browser subscription yet — echo to the console so dev still sees it.
      await consoleChannel.deliver({ endpoint: "", p256dh: "", auth: "" }, payload);
      delivered = true;
    }
  } else {
    await consoleChannel.deliver({ endpoint: "", p256dh: "", auth: "" }, payload);
    delivered = true;
  }
  return { channel, delivered };
}

export async function dispatchNotification(input: NotifyInput) {
  const now = new Date();
  const settings = await prisma.userSettings.findUnique({ where: { userId: input.userId } });

  const quiet = settings
    ? isQuietHours(
        { enabled: settings.quietHoursEnabled, start: settings.quietHoursStart, end: settings.quietHoursEnd },
        now
      )
    : false;
  // Kill switch pauses ALL delivery (including expiry notices); like quiet hours,
  // held notifications still land in NotificationLog with deliveredAt: null —
  // the worker's flushHeldNotifications sweep delivers them once the hold lifts.
  const held = (quiet && !input.allowInQuietHours) || settings?.killSwitch === true;

  const channel = channelFor(settings);
  const payload: PushPayload = {
    title: input.title,
    body: input.body,
    deepLink: input.deepLink,
    tag: input.proposalId,
    proposalId: input.proposalId,
    kind: input.kind,
  };

  let delivered = false;
  if (!held) {
    ({ delivered } = await deliverToUser(input.userId, settings, payload));
  }

  return prisma.notificationLog.create({
    data: {
      userId: input.userId,
      proposalId: input.proposalId ?? null,
      ruleId: input.ruleId ?? null,
      kind: input.kind,
      channel,
      title: input.title,
      body: input.body,
      deepLink: input.deepLink ?? null,
      sentAt: now,
      deliveredAt: !held && delivered ? now : null,
    },
  });
}
