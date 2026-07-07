/* FlipDeck service worker — Web Push receiver + notification click routing. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "FlipDeck", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "FlipDeck";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    data: { deepLink: data.deepLink || "/alerts" },
    icon: "/icon.svg",
    badge: "/icon.svg",
    actions: [
      { action: "approve", title: "Approve" },
      { action: "decline", title: "Decline" },
    ],
    requireInteraction: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = (event.notification.data && event.notification.data.deepLink) || "/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(deepLink);
          return client.focus();
        }
      }
      return self.clients.openWindow(deepLink);
    })
  );
});
