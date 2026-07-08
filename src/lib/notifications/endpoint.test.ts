// isValidPushEndpoint guards the PushSubscription write boundary (cycle 13):
// only https endpoints (plus http on localhost for dev push services) of sane
// length may be persisted — everything else is rejected before the upsert.

import { describe, expect, it } from "vitest";
import { isValidPushEndpoint, MAX_PUSH_ENDPOINT_LENGTH } from "./endpoint";

describe("isValidPushEndpoint", () => {
  it("accepts a real https push service endpoint", () => {
    expect(isValidPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123:def456")).toBe(true);
    expect(isValidPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAAA")).toBe(true);
  });

  it("accepts http only for localhost and 127.0.0.1 (local dev push service)", () => {
    expect(isValidPushEndpoint("http://localhost:8030/push/abc")).toBe(true);
    expect(isValidPushEndpoint("http://127.0.0.1:8030/push/abc")).toBe(true);
  });

  it("rejects http on any non-local host", () => {
    expect(isValidPushEndpoint("http://push.example.com/e1")).toBe(false);
    expect(isValidPushEndpoint("http://localhost.evil.com/e1")).toBe(false);
  });

  it("rejects non-https protocols", () => {
    expect(isValidPushEndpoint("ftp://push.example.com/e1")).toBe(false);
    expect(isValidPushEndpoint("javascript:alert(1)")).toBe(false);
    expect(isValidPushEndpoint("file:///etc/passwd")).toBe(false);
  });

  it("rejects strings that are not URLs at all", () => {
    expect(isValidPushEndpoint("not a url")).toBe(false);
    expect(isValidPushEndpoint("//missing-protocol.example/e1")).toBe(false);
    expect(isValidPushEndpoint("")).toBe(false);
  });

  it("rejects absurdly long endpoints but accepts ones at the limit", () => {
    const base = "https://push.example.com/";
    const atLimit = base + "x".repeat(MAX_PUSH_ENDPOINT_LENGTH - base.length);
    expect(atLimit.length).toBe(MAX_PUSH_ENDPOINT_LENGTH);
    expect(isValidPushEndpoint(atLimit)).toBe(true);
    expect(isValidPushEndpoint(atLimit + "x")).toBe(false);
  });
});
