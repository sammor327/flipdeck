// deliverToUser tests (cycle 12): dead-subscription pruning + console fallback.
//   - A subscription the push service reports gone (HTTP 404/410 → the channel
//     returns "gone") is deleted during delivery; transient failures ("failed",
//     e.g. network error or 5xx) leave the row in place.
//   - When the user HAS subscriptions but none deliver, the console channel is
//     the guaranteed fallback and the notification counts as delivered — the
//     same semantics as the existing zero-subscription branch.
//   - One live subscription delivering never triggers the console echo.
//
// The prisma mock is state-driven (like flush.test.ts): tests stage
// PushSubscription rows in `db.subs`, per-endpoint outcomes in `pushResults`
// ("gone" models a 404/410 from the push service, "failed" a transient error),
// and console echoes land in `deliveries`.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { db, deliveries, pushResults } = vi.hoisted(() => ({
  db: {
    subs: [] as Row[],
    deleteManyCalls: [] as Row[], // `where` of every pushSubscription.deleteMany
  },
  deliveries: [] as Row[],
  pushResults: new Map<string, "ok" | "failed" | "gone">(),
}));

vi.mock("../db", () => ({
  prisma: {
    pushSubscription: {
      findMany: async ({ where }: any) => db.subs.filter((s) => s.userId === where.userId),
      deleteMany: async ({ where }: any) => {
        db.deleteManyCalls.push(where);
        const endpoints: string[] = where.endpoint.in;
        const before = db.subs.length;
        db.subs = db.subs.filter((s) => !(s.userId === where.userId && endpoints.includes(s.endpoint)));
        return { count: before - db.subs.length };
      },
    },
  },
}));

// Configured web push whose per-endpoint outcome is staged in pushResults.
vi.mock("./webpush", () => ({
  webPushChannel: {
    id: "webpush",
    isConfigured: () => true,
    deliver: async (sub: { endpoint: string }) => pushResults.get(sub.endpoint) ?? "failed",
  },
}));
vi.mock("./console", () => ({
  consoleChannel: {
    id: "console",
    isConfigured: () => true,
    deliver: async (_sub: unknown, payload: Row) => {
      deliveries.push(payload);
      return "ok";
    },
  },
}));

import { deliverToUser } from "./dispatch";

function sub(endpoint: string, userId = "u1"): Row {
  return { id: `ps-${endpoint}`, userId, endpoint, p256dh: `p-${endpoint}`, auth: `a-${endpoint}` };
}

const settings = { pushEnabled: true };
const payload = { title: "Flip alert", body: "Charizard spiked" };

beforeEach(() => {
  db.subs = [];
  db.deleteManyCalls = [];
  deliveries.length = 0;
  pushResults.clear();
});

describe("deliverToUser", () => {
  it("deletes a subscription whose endpoint the push service reports gone (410)", async () => {
    db.subs = [sub("e-410")];
    pushResults.set("e-410", "gone");

    await deliverToUser("u1", settings, payload);
    expect(db.subs).toHaveLength(0);
    expect(db.deleteManyCalls).toEqual([{ endpoint: { in: ["e-410"] }, userId: "u1" }]);
  });

  it("deletes a subscription whose endpoint the push service reports gone (404)", async () => {
    db.subs = [sub("e-404")];
    pushResults.set("e-404", "gone");

    await deliverToUser("u1", settings, payload);
    expect(db.subs).toHaveLength(0);
    expect(db.deleteManyCalls).toEqual([{ endpoint: { in: ["e-404"] }, userId: "u1" }]);
  });

  it("keeps a subscription that fails transiently (network error / 5xx)", async () => {
    db.subs = [sub("e-flaky")];
    pushResults.set("e-flaky", "failed");

    await deliverToUser("u1", settings, payload);
    expect(db.subs).toHaveLength(1);
    expect(db.deleteManyCalls).toHaveLength(0);
  });

  it("falls back to the console echo and reports delivered when every sub is dead", async () => {
    db.subs = [sub("e-gone"), sub("e-flaky")];
    pushResults.set("e-gone", "gone");
    pushResults.set("e-flaky", "failed");

    const res = await deliverToUser("u1", settings, payload);
    expect(res).toEqual({ channel: "webpush", delivered: true });
    expect(deliveries).toEqual([payload]);
    // The gone endpoint is pruned; the transient one survives for next time.
    expect(db.subs.map((s) => s.endpoint)).toEqual(["e-flaky"]);
  });

  it("one live sub delivers, prunes the dead one, and never console-echoes", async () => {
    db.subs = [sub("e-live"), sub("e-dead")];
    pushResults.set("e-live", "ok");
    pushResults.set("e-dead", "gone");

    const res = await deliverToUser("u1", settings, payload);
    expect(res).toEqual({ channel: "webpush", delivered: true });
    expect(deliveries).toHaveLength(0);
    expect(db.subs.map((s) => s.endpoint)).toEqual(["e-live"]);
    expect(db.deleteManyCalls).toEqual([{ endpoint: { in: ["e-dead"] }, userId: "u1" }]);
  });

  it("zero subscriptions still echoes to the console without touching deleteMany", async () => {
    const res = await deliverToUser("u1", settings, payload);
    expect(res).toEqual({ channel: "webpush", delivered: true });
    expect(deliveries).toEqual([payload]);
    expect(db.deleteManyCalls).toHaveLength(0);
  });

  it("only prunes the delivering user's rows, never another user's same-state subs", async () => {
    db.subs = [sub("e-dead", "u1"), sub("e-other", "u2")];
    pushResults.set("e-dead", "gone");
    pushResults.set("e-other", "gone");

    await deliverToUser("u1", settings, payload);
    expect(db.subs.map((s) => s.endpoint)).toEqual(["e-other"]);
    expect(db.deleteManyCalls).toEqual([{ endpoint: { in: ["e-dead"] }, userId: "u1" }]);
  });
});
