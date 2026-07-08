// Web Push channel (browser service worker). Active only when VAPID keys are
// present; otherwise the dispatcher falls back to the console channel so dev
// works keyless. Generate keys with: npx web-push generate-vapid-keys

import webpush from "web-push";
import type { DeliverResult, PushChannel, PushPayload, PushSub } from "./types";

/**
 * Socket timeout for a single send. web-push only sets a timeout when one is
 * passed explicitly, so without this a black-hole endpoint hangs the request
 * forever — and since the worker tick awaits deliveries, the whole ingest
 * loop with it. A timeout rejection has no statusCode, so deliver() maps it
 * to "failed" (transient), never "gone". Overridable via PUSH_TIMEOUT_MS.
 */
export const PUSH_TIMEOUT_MS = Number(process.env.PUSH_TIMEOUT_MS) || 10_000;

let ready = false;
function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!ready) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:dev@flipdeck.local", pub, priv);
    ready = true;
  }
  return true;
}

export const webPushChannel: PushChannel = {
  id: "webpush",
  isConfigured() {
    return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  },
  async deliver(sub: PushSub, payload: PushPayload): Promise<DeliverResult> {
    if (!ensureConfigured()) return "failed";
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { timeout: PUSH_TIMEOUT_MS }
      );
      return "ok";
    } catch (err) {
      // web-push's WebPushError carries the push service's HTTP status. 404/410
      // mean the subscription is permanently gone — tell the caller to prune
      // it. Anything else (network error, 5xx) is transient; caller keeps going.
      const status = (err as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? "gone" : "failed";
    }
  },
};
