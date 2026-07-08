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
  const isProposal = data.kind === "proposal" && data.proposalId;
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    data: { deepLink: data.deepLink || "/alerts", proposalId: data.proposalId || undefined },
    icon: "/icon.svg",
    badge: "/icon.svg",
    requireInteraction: true,
  };
  // Only proposal pushes get action buttons — expiry/hindsight/info pushes have
  // nothing to approve, so buttons there would be a false affordance.
  if (isProposal) {
    options.actions = [
      { action: "approve", title: "Approve" },
      { action: "decline", title: "Decline" },
    ];
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Show a follow-up notification confirming what the action button did. No
   actions array — a body tap navigates to data.deepLink via the normal path. */
function showConfirmation(title, body, deepLink) {
  return self.registration.showNotification(title, {
    body: body,
    data: { deepLink: deepLink || "/alerts" },
    icon: "/icon.svg",
    badge: "/icon.svg",
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const deepLink = data.deepLink || "/alerts";

  // Approve/Decline action buttons on a proposal push → POST the decision. The
  // fetch is same-origin so the fd_session cookie rides along; the route's
  // server action authenticates and enforces ownership/pending/expiry.
  if ((event.action === "approve" || event.action === "decline") && data.proposalId) {
    const action = event.action;
    event.waitUntil(
      fetch("/api/proposals/" + data.proposalId + "/" + action, {
        method: "POST",
        credentials: "same-origin",
      })
        .then((r) => r.json())
        .then((json) => {
          if (json && json.ok) {
            if (action === "approve") {
              return showConfirmation(
                "Approved — tap to open listing",
                "Undo available in the app for 5s",
                json.deepLink || deepLink
              );
            }
            return showConfirmation("Declined", "Undo available in the app for 5s", "/alerts");
          }
          // Already decided / expired / not found — surface the action's error
          // instead of failing silently; tap opens the app at the original link.
          return showConfirmation((json && json.error) || "Couldn't complete action", "Tap to open FlipDeck", deepLink);
        })
        .catch(() => showConfirmation("Couldn't reach FlipDeck — open the app", "Tap to open FlipDeck", deepLink))
    );
    return;
  }

  // Plain body tap → focus an open FlipDeck window (or open one) at the deep link.
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
