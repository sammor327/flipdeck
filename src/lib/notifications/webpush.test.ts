// webPushChannel.deliver result mapping (cycle 12): the web-push library's
// WebPushError carries the push service's HTTP status in `statusCode`.
// 404/410 mean the subscription is permanently gone → "gone" (caller prunes);
// anything else (5xx, plain network error) is transient → "failed"; a
// successful send → "ok"; keyless (no VAPID env) → "failed".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: sendMock },
}));

import { webPushChannel } from "./webpush";

const sub = { endpoint: "https://push.example/e1", p256dh: "p", auth: "a" };
const payload = { title: "T", body: "B" };

/** Shape of the web-push library's WebPushError, as far as deliver() cares. */
function pushError(statusCode: number): Error {
  return Object.assign(new Error(`Received unexpected response code ${statusCode}`), { statusCode });
}

beforeEach(() => {
  sendMock.mockReset();
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-priv");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("webPushChannel.deliver", () => {
  it("returns ok when the push service accepts the send", async () => {
    sendMock.mockResolvedValue({ statusCode: 201 });
    expect(await webPushChannel.deliver(sub, payload)).toBe("ok");
    expect(sendMock).toHaveBeenCalledWith(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
  });

  it("returns gone on HTTP 410 (subscription expired)", async () => {
    sendMock.mockRejectedValue(pushError(410));
    expect(await webPushChannel.deliver(sub, payload)).toBe("gone");
  });

  it("returns gone on HTTP 404 (endpoint not found)", async () => {
    sendMock.mockRejectedValue(pushError(404));
    expect(await webPushChannel.deliver(sub, payload)).toBe("gone");
  });

  it("returns failed on a 5xx from the push service", async () => {
    sendMock.mockRejectedValue(pushError(500));
    expect(await webPushChannel.deliver(sub, payload)).toBe("failed");
  });

  it("returns failed on a plain network error with no statusCode", async () => {
    sendMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await webPushChannel.deliver(sub, payload)).toBe("failed");
  });

  it("returns failed when VAPID keys are missing (keyless dev)", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await webPushChannel.deliver(sub, payload)).toBe("failed");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
