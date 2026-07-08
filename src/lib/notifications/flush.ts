// Flush sweep for held notifications. dispatchNotification records anything
// held by quiet hours or the kill switch as a NotificationLog row with
// deliveredAt: null; nothing else ever re-attempts those rows, so the worker
// calls flushHeldNotifications once per tick. Per user: skip while the hold is
// still in force (kill-switch-held rows flush on the first sweep after the
// switch turns off); with digestMode and 2+ held rows send ONE morning-digest
// summary; otherwise replay each row from its stored title/body/deepLink.

import { prisma } from "../db";
import { deliverToUser } from "./dispatch";
import { isQuietHours } from "./quietHours";
import type { NotificationKind } from "./types";

// Held rows older than this never flush — they are stale failed-push rows from
// before an outage, not quiet-hours holds worth resurrecting.
const MAX_HELD_AGE_MS = 36 * 60 * 60 * 1000;

// How many held titles the digest body spells out before "and N more".
const DIGEST_TITLE_SAMPLE = 3;

/**
 * Deliver every held (deliveredAt: null) NotificationLog row whose owner is no
 * longer quiet/killed, stamping deliveredAt even when every push endpoint
 * fails (the console channel is the guaranteed fallback; an un-stamped row
 * would retry forever). Returns the number of held rows flushed. Each user is
 * fault-isolated: one user's failure never blocks another's flush.
 */
export async function flushHeldNotifications(now: Date): Promise<number> {
  const held = await prisma.notificationLog.findMany({
    where: { deliveredAt: null, sentAt: { gte: new Date(now.getTime() - MAX_HELD_AGE_MS) } },
    orderBy: { sentAt: "asc" },
  });
  if (held.length === 0) return 0;

  const byUser = new Map<string, typeof held>();
  for (const row of held) {
    const rows = byUser.get(row.userId);
    if (rows) rows.push(row);
    else byUser.set(row.userId, [row]);
  }

  let flushed = 0;
  for (const [userId, rows] of byUser) {
    try {
      // No settings row means never quiet and never killed → flush immediately.
      const settings = await prisma.userSettings.findUnique({ where: { userId } });
      if (settings?.killSwitch) continue;
      if (
        settings &&
        isQuietHours(
          { enabled: settings.quietHoursEnabled, start: settings.quietHoursStart, end: settings.quietHoursEnd },
          now
        )
      ) {
        continue;
      }

      if (settings?.digestMode && rows.length >= 2) {
        const titles = rows.slice(0, DIGEST_TITLE_SAMPLE).map((r) => r.title);
        const more = rows.length - titles.length;
        const deepLink = `${process.env.APP_URL || "http://localhost:3000"}/alerts`;
        const title = `Morning digest — ${rows.length} alerts while you were away`;
        const body = titles.join(" · ") + (more > 0 ? ` and ${more} more` : "");
        const { channel } = await deliverToUser(userId, settings, { title, body, deepLink, kind: "digest" });
        await prisma.notificationLog.create({
          data: { userId, kind: "digest", channel, title, body, deepLink, sentAt: now, deliveredAt: now },
        });
        await prisma.notificationLog.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { deliveredAt: now },
        });
        flushed += rows.length;
      } else {
        for (const r of rows) {
          await deliverToUser(userId, settings, {
            title: r.title,
            body: r.body,
            deepLink: r.deepLink ?? undefined,
            tag: r.proposalId ?? undefined,
            proposalId: r.proposalId ?? undefined,
            kind: r.kind as NotificationKind,
          });
          // Stamp after the attempt no matter what the endpoints said.
          await prisma.notificationLog.updateMany({ where: { id: r.id }, data: { deliveredAt: now } });
          flushed++;
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[worker] notification flush for user ${userId} failed:`, err);
    }
  }
  return flushed;
}
