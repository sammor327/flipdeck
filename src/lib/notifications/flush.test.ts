// Quiet-hours flush tests (cycle 10):
//   - quietHoursEnd (pure): the next end of the window from inside it, across
//     the midnight wrap; null when disabled, degenerate, or not quiet.
//   - flushHeldNotifications: held rows (deliveredAt: null) deliver on the
//     first sweep after the window ends — individually, or as ONE digest when
//     digestMode is on and 2+ rows are held — and never while the user is
//     still quiet or kill-switched. deliveredAt is stamped after the attempt.
//
// The prisma mock is state-driven (like tick.test.ts): tests stage
// NotificationLog rows + a UserSettings row in `db`, and deliveries land in
// `deliveries` via a mocked console channel (web push is mocked keyless, so
// the console fallback is always the selected channel).

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { db, deliveries } = vi.hoisted(() => ({
  db: {
    logs: [] as Row[],
    created: [] as Row[], // rows added by notificationLog.create (the digest)
    settings: new Map<string, Row | "THROW">(),
    logSeq: 0,
  },
  deliveries: [] as Row[],
}));

vi.mock("../db", () => ({
  prisma: {
    notificationLog: {
      // The flush's only read: held rows within the age bound, oldest first.
      findMany: async ({ where }: any) =>
        db.logs
          .filter((r) => r.deliveredAt === null && r.sentAt.getTime() >= where.sentAt.gte.getTime())
          .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime()),
      create: async ({ data }: any) => {
        const row = { id: `nl-${++db.logSeq}`, ...data };
        db.logs.push(row);
        db.created.push(row);
        return row;
      },
      // Supports both shapes the flush uses: { id: "x" } and { id: { in: [...] } }.
      updateMany: async ({ where, data }: any) => {
        const ids: string[] = typeof where.id === "string" ? [where.id] : where.id.in;
        const hits = db.logs.filter((r) => ids.includes(r.id));
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
    },
    userSettings: {
      findUnique: async ({ where }: any) => {
        const row = db.settings.get(where.userId);
        if (row === "THROW") throw new Error("settings load failed");
        return row ?? null;
      },
    },
    pushSubscription: { findMany: async () => [] },
  },
}));

// Keyless web push → deliverToUser always selects the console channel, whose
// mock records every payload it is handed.
vi.mock("./webpush", () => ({
  webPushChannel: { id: "webpush", isConfigured: () => false, deliver: async () => false },
}));
vi.mock("./console", () => ({
  consoleChannel: {
    id: "console",
    isConfigured: () => true,
    deliver: async (_sub: unknown, payload: Row) => {
      deliveries.push(payload);
      return true;
    },
  },
}));

import { flushHeldNotifications } from "./flush";
import { quietHoursEnd, type QuietHoursConfig } from "./quietHours";

/** Local time on a fixed day (quiet-hours math is local-time based). */
function at(hours: number, minutes: number, dayOffset = 0): Date {
  return new Date(2026, 6, 7 + dayOffset, hours, minutes);
}

/** Default window: 22:00 → 07:00, wrapping midnight. */
function cfg(overrides: Partial<QuietHoursConfig> = {}): QuietHoursConfig {
  return { enabled: true, start: 1320, end: 420, ...overrides };
}

function heldRow(id: string, userId: string, sentAt: Date, overrides: Row = {}): Row {
  return {
    id,
    userId,
    proposalId: null,
    ruleId: null,
    kind: "proposal",
    channel: "console",
    title: `Alert ${id}`,
    body: `Body ${id}`,
    deepLink: `http://localhost:3000/alerts?proposal=${id}`,
    sentAt,
    deliveredAt: null,
    ...overrides,
  };
}

function settingsRow(overrides: Row = {}): Row {
  return {
    userId: "u1",
    quietHoursEnabled: true,
    quietHoursStart: 1320, // 22:00
    quietHoursEnd: 420, //     07:00
    pushEnabled: true,
    digestMode: false,
    killSwitch: false,
    ...overrides,
  };
}

beforeEach(() => {
  db.logs = [];
  db.created = [];
  db.settings = new Map();
  db.logSeq = 0;
  deliveries.length = 0;
});

describe("quietHoursEnd", () => {
  it("returns today's end for a non-wrapping window", () => {
    // 09:00 → 17:00, asked at noon.
    expect(quietHoursEnd(cfg({ start: 540, end: 1020 }), at(12, 0))).toEqual(at(17, 0));
  });

  it("wraps to tomorrow's end when asked before midnight", () => {
    expect(quietHoursEnd(cfg(), at(23, 30))).toEqual(at(7, 0, 1));
  });

  it("returns today's end when asked after midnight", () => {
    expect(quietHoursEnd(cfg(), at(6, 0))).toEqual(at(7, 0));
  });

  it("returns null outside the window", () => {
    expect(quietHoursEnd(cfg(), at(12, 0))).toBeNull();
    // The end minute itself is already outside (isQuietHours is end-exclusive).
    expect(quietHoursEnd(cfg(), at(7, 0))).toBeNull();
  });

  it("returns null when disabled", () => {
    expect(quietHoursEnd(cfg({ enabled: false }), at(23, 30))).toBeNull();
  });

  it("returns null for a degenerate start === end window", () => {
    expect(quietHoursEnd(cfg({ start: 420, end: 420 }), at(7, 0))).toBeNull();
  });
});

describe("flushHeldNotifications", () => {
  it("delivers each held row individually after the window ends and stamps deliveredAt", async () => {
    const now = at(7, 30);
    db.settings.set("u1", settingsRow());
    db.logs = [heldRow("n1", "u1", at(23, 0, -1)), heldRow("n2", "u1", at(6, 15))];

    expect(await flushHeldNotifications(now)).toBe(2);
    expect(deliveries.map((d) => d.title)).toEqual(["Alert n1", "Alert n2"]);
    expect(deliveries[0]).toMatchObject({ body: "Body n1", deepLink: "http://localhost:3000/alerts?proposal=n1" });
    expect(db.logs.every((r) => r.deliveredAt?.getTime() === now.getTime())).toBe(true);
    expect(db.created).toHaveLength(0); // no digest wrapper without digestMode
  });

  it("flushes nothing while the user is still inside quiet hours", async () => {
    db.settings.set("u1", settingsRow());
    db.logs = [heldRow("n1", "u1", at(23, 0, -1))];

    expect(await flushHeldNotifications(at(6, 30))).toBe(0);
    expect(deliveries).toHaveLength(0);
    expect(db.logs[0].deliveredAt).toBeNull();
  });

  it("flushes nothing while the kill switch is on, then flushes once it lifts", async () => {
    db.settings.set("u1", settingsRow({ killSwitch: true }));
    db.logs = [heldRow("n1", "u1", at(11, 0))];

    expect(await flushHeldNotifications(at(12, 0))).toBe(0);
    expect(db.logs[0].deliveredAt).toBeNull();

    // Same sweep, next tick after the switch turns off.
    db.settings.set("u1", settingsRow({ killSwitch: false }));
    expect(await flushHeldNotifications(at(12, 5))).toBe(1);
    expect(deliveries).toHaveLength(1);
  });

  it("digestMode with 2+ held rows sends ONE digest and stamps every held row", async () => {
    const now = at(7, 30);
    db.settings.set("u1", settingsRow({ digestMode: true }));
    db.logs = [heldRow("n1", "u1", at(22, 30, -1)), heldRow("n2", "u1", at(1, 0)), heldRow("n3", "u1", at(5, 0))];

    expect(await flushHeldNotifications(now)).toBe(3);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      title: "Morning digest — 3 alerts while you were away",
      body: "Alert n1 · Alert n2 · Alert n3",
      kind: "digest",
    });
    expect(deliveries[0].deepLink).toContain("/alerts");
    // The digest itself is logged, already delivered.
    expect(db.created).toHaveLength(1);
    expect(db.created[0]).toMatchObject({ userId: "u1", kind: "digest", deliveredAt: now });
    // And every held row is stamped so it can never flush twice.
    for (const id of ["n1", "n2", "n3"]) {
      expect(db.logs.find((r) => r.id === id)?.deliveredAt).toEqual(now);
    }
  });

  it("digest body samples the first 3 titles and counts the rest", async () => {
    db.settings.set("u1", settingsRow({ digestMode: true }));
    db.logs = ["n1", "n2", "n3", "n4", "n5"].map((id, i) => heldRow(id, "u1", at(0, 10 + i)));

    expect(await flushHeldNotifications(at(7, 30))).toBe(5);
    expect(deliveries[0].title).toBe("Morning digest — 5 alerts while you were away");
    expect(deliveries[0].body).toBe("Alert n1 · Alert n2 · Alert n3 and 2 more");
  });

  it("exactly one held row under digestMode delivers normally (no digest wrapper)", async () => {
    db.settings.set("u1", settingsRow({ digestMode: true }));
    db.logs = [heldRow("n1", "u1", at(23, 0, -1))];

    expect(await flushHeldNotifications(at(7, 30))).toBe(1);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ title: "Alert n1", body: "Body n1" });
    expect(db.created).toHaveLength(0);
  });

  it("a user with no settings row is never quiet and flushes immediately", async () => {
    db.logs = [heldRow("n1", "u1", at(23, 0))]; // e.g. held earlier by the kill switch, since deleted
    expect(await flushHeldNotifications(at(23, 30))).toBe(1); // inside the DEFAULT window — but there is no row
    expect(deliveries).toHaveLength(1);
  });

  it("never resurrects rows older than the 36h age bound", async () => {
    const now = at(12, 0);
    db.settings.set("u1", settingsRow());
    db.logs = [heldRow("ancient", "u1", new Date(now.getTime() - 40 * 3600_000)), heldRow("fresh", "u1", at(6, 0))];

    expect(await flushHeldNotifications(now)).toBe(1);
    expect(deliveries.map((d) => d.title)).toEqual(["Alert fresh"]);
    expect(db.logs.find((r) => r.id === "ancient")?.deliveredAt).toBeNull();
  });

  it("isolates per-user failures: one broken user never blocks another's flush", async () => {
    db.settings.set("u1", "THROW");
    db.settings.set("u2", settingsRow({ userId: "u2" }));
    db.logs = [heldRow("n1", "u1", at(11, 0)), heldRow("n2", "u2", at(11, 0))];

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await flushHeldNotifications(at(12, 0))).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("u1"), expect.any(Error));
    errSpy.mockRestore();

    expect(deliveries.map((d) => d.title)).toEqual(["Alert n2"]);
    expect(db.logs.find((r) => r.id === "n1")?.deliveredAt).toBeNull();
  });
});
