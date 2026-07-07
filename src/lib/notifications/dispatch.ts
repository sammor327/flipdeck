// Notification dispatcher: the one place that decides channel, honors quiet
// hours + user prefs, delivers, and records a NotificationLog. Used by both the
// worker (rule fires) and server actions (expiry hindsight, etc).

import { prisma } from "../db";
import { consoleChannel } from "./console";
import { isQuietHours } from "./quietHours";
import type { NotifyInput } from "./types";
import { webPushChannel } from "./webpush";

export async function dispatchNotification(input: NotifyInput) {
  const now = new Date();
  const settings = await prisma.userSettings.findUnique({ where: { userId: input.userId } });

  const quiet = settings
    ? isQuietHours(
        { enabled: settings.quietHoursEnabled, start: settings.quietHoursStart, end: settings.quietHoursEnd },
        now
      )
    : false;
  const held = quiet && !input.allowInQuietHours;

  const usePush = webPushChannel.isConfigured() && (settings?.pushEnabled ?? true);
  const channel = usePush ? "webpush" : "console";
  const payload = { title: input.title, body: input.body, deepLink: input.deepLink, tag: input.proposalId };

  let delivered = false;
  if (!held) {
    if (usePush) {
      const subs = await prisma.pushSubscription.findMany({ where: { userId: input.userId } });
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
