"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestNotification } from "@/app/actions/push";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [subscribed, setSubscribed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const configured = Boolean(vapidPublicKey);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  const subscribe = () =>
    startTransition(async () => {
      try {
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") {
            setStatus("Permission denied.");
            return;
          }
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        const json = sub.toJSON();
        const res = await savePushSubscription({
          endpoint: json.endpoint ?? sub.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        });
        setSubscribed(res.ok);
        setStatus(res.ok ? "Subscribed to Web Push." : res.error ?? "Failed");
      } catch (e) {
        setStatus("Subscription failed — check VAPID keys.");
      }
    });

  const unsubscribe = () =>
    startTransition(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setStatus("Unsubscribed.");
    });

  const test = () =>
    startTransition(async () => {
      await sendTestNotification();
      setStatus("Test sent — check your device (or the server console in dev).");
    });

  return (
    <div>
      {!configured ? (
        <div className="hint" style={{ marginBottom: 8 }}>
          Web Push keys aren&apos;t configured, so notifications use the console fallback (dev-safe). Set{" "}
          <code>VAPID_*</code> env vars to enable real browser push.
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {subscribed ? (
          <button className="btn" onClick={unsubscribe} disabled={pending}>
            Disable browser push
          </button>
        ) : (
          <button className="btn pri" onClick={subscribe} disabled={pending || !configured}>
            Enable browser push
          </button>
        )}
        <button className="btn ghost" onClick={test} disabled={pending}>
          Send test notification
        </button>
      </div>
      {status ? (
        <div className="hint" style={{ marginTop: 8 }}>
          {status}
        </div>
      ) : null}
    </div>
  );
}
