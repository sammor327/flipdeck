// Console channel — the always-available dev fallback. Prints the notification
// the user would have received so the whole alert→approval loop is observable
// without configuring Web Push.

import type { PushChannel, PushPayload } from "./types";

export const consoleChannel: PushChannel = {
  id: "console",
  isConfigured() {
    return true;
  },
  async deliver(_sub, payload: PushPayload): Promise<boolean> {
    const link = payload.deepLink ? `  ↗ ${payload.deepLink}` : "";
    // eslint-disable-next-line no-console
    console.log(`\n🔔 [FlipDeck] ${payload.title}\n   ${payload.body}${link}\n`);
    return true;
  },
};
