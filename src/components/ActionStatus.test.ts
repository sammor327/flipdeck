// applyFlash drives the inline action-status feedback (SettingsForm, WatchButton,
// RefreshPrices, CardTable targets): successes must auto-clear, errors must
// persist, and a pending success auto-clear must never erase a newer status.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyFlash, OK_TTL_MS, type ActionStatusValue } from "./ActionStatus";

function harness() {
  let status: ActionStatusValue | null = null;
  const timer: { current: ReturnType<typeof setTimeout> | null } = { current: null };
  const set = (s: ActionStatusValue | null) => {
    status = s;
  };
  return { get status() { return status; }, timer, set };
}

describe("applyFlash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a success and auto-clears it after the TTL", () => {
    const h = harness();
    applyFlash("ok", "✓ Saved", h.set, h.timer);
    expect(h.status).toEqual({ kind: "ok", text: "✓ Saved" });

    vi.advanceTimersByTime(OK_TTL_MS - 1);
    expect(h.status).toEqual({ kind: "ok", text: "✓ Saved" });

    vi.advanceTimersByTime(1);
    expect(h.status).toBeNull();
    expect(h.timer.current).toBeNull();
  });

  it("keeps errors visible until the next action (no auto-clear)", () => {
    const h = harness();
    applyFlash("error", "Not signed in", h.set, h.timer);
    expect(h.status).toEqual({ kind: "error", text: "Not signed in" });

    vi.advanceTimersByTime(OK_TTL_MS * 10);
    expect(h.status).toEqual({ kind: "error", text: "Not signed in" });
    expect(h.timer.current).toBeNull();
  });

  it("cancels a pending success auto-clear so it cannot erase a newer error", () => {
    const h = harness();
    applyFlash("ok", "✓ Saved", h.set, h.timer);
    applyFlash("error", "Save failed", h.set, h.timer);

    vi.advanceTimersByTime(OK_TTL_MS * 2);
    expect(h.status).toEqual({ kind: "error", text: "Save failed" });
  });

  it("restarts the auto-clear window on back-to-back successes", () => {
    const h = harness();
    applyFlash("ok", "first", h.set, h.timer);
    vi.advanceTimersByTime(OK_TTL_MS - 500);
    applyFlash("ok", "second", h.set, h.timer);

    vi.advanceTimersByTime(500);
    expect(h.status).toEqual({ kind: "ok", text: "second" }); // old timer must not fire
    vi.advanceTimersByTime(OK_TTL_MS - 500);
    expect(h.status).toBeNull();
  });
});
