// Web Push channel (browser service worker). Active only when VAPID keys are
// present; otherwise the dispatcher falls back to the console channel so dev
// works keyless. Generate keys with: npx web-push generate-vapid-keys

import webpush from "web-push";
import type { DeliverResult, PushChannel, PushPayload, PushSub } from "./types";

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
        JSON.stringify(payload)
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
