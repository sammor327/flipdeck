import type { NotificationChannel } from "../constants";

export type NotificationKind = "proposal" | "info" | "expiry" | "hindsight" | "digest";

export interface NotifyInput {
  userId: string;
  title: string;
  body: string;
  deepLink?: string;
  kind: NotificationKind;
  proposalId?: string;
  ruleId?: string;
  /** Rules with quietHoursRespected=false pass true so urgent alerts break through. */
  allowInQuietHours?: boolean;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  deepLink?: string;
  tag?: string;
  /** Set for kind="proposal" pushes so the service worker can render Approve/Decline actions. */
  proposalId?: string;
  kind?: NotificationKind;
}

/**
 * Outcome of a single delivery attempt. "gone" means the push service said the
 * subscription no longer exists (HTTP 404/410) — the caller should prune it;
 * "failed" is transient (network error, 5xx) and worth re-attempting later.
 */
export type DeliverResult = "ok" | "failed" | "gone";

/**
 * A delivery channel. Web Push (browser) ships in v1; the interface is
 * transport-agnostic so native push (FCM/APNs) is a new implementation, not a
 * rewrite — exactly the extension point the brief asks for.
 */
export interface PushChannel {
  readonly id: NotificationChannel;
  isConfigured(): boolean;
  deliver(sub: PushSub, payload: PushPayload): Promise<DeliverResult>;
}
