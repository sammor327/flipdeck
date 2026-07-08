// Race-safety tests for the proposal sweeps: expireStaleProposals and
// recordDeclinedHindsight must claim each row with a guarded updateMany, so
// they can never flip a proposal whose status changed (approved! undone!)
// between their read and their write — and must not send a notification for
// rows they did not transition.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { state } = vi.hoisted(() => ({
  state: { rows: [] as Row[], view: [] as Row[] },
}));

vi.mock("../db", () => ({
  prisma: {
    tradeProposal: {
      // Applies the sweep's where clause to the pre-canned view — EXCEPT
      // status: the view models the read snapshot, and rows whose status
      // changed between the read and the write are exactly the race the
      // guarded updateMany must handle. Fields a row does not model are
      // treated as unconstrained. Supports the operators the sweeps use:
      // equality, null, { lte: Date }, and OR.
      findMany: async ({ where }: any) => state.view.filter((r) => whereMatches(r, where)),
      updateMany: async ({ where, data }: any) => {
        const hits = state.rows.filter(
          (r) =>
            r.id === where.id &&
            r.status === where.status &&
            (!("outcomeNote" in where) || r.outcomeNote === where.outcomeNote)
        );
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
    },
  },
}));

function whereMatches(row: Row, where: Record<string, any>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "status") continue; // see findMany comment: status races are staged, not filtered
    if (key === "OR") {
      if (!(cond as Record<string, any>[]).some((w) => whereMatches(row, w))) return false;
      continue;
    }
    if (!(key in row)) continue; // unmodeled field → unconstrained
    const val = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      if ("lte" in cond && (val == null || val.getTime() > cond.lte.getTime())) return false;
    } else if (cond === null) {
      if (val !== null) return false;
    } else if (val !== cond) {
      return false;
    }
  }
  return true;
}

vi.mock("../notifications/dispatch", () => ({ dispatchNotification: vi.fn(async () => undefined) }));

import { dispatchNotification } from "../notifications/dispatch";
import { expireStaleProposals, recordDeclinedHindsight } from "./tick";

function row(id: string, status: string): Row {
  return {
    id,
    userId: "u1",
    cardId: "c1",
    side: "sell",
    proposedPrice: 10,
    status,
    outcomePrice: null,
    outcomeNote: null,
    card: { name: "Test Card", marketStat: { currentPrice: 12 } },
  };
}

beforeEach(() => {
  state.rows = [];
  state.view = [];
  vi.mocked(dispatchNotification).mockClear();
});

describe("expireStaleProposals", () => {
  it("expires still-pending rows with hindsight and notifies once each", async () => {
    const p = row("tp-1", "pending");
    state.rows = [p];
    state.view = [p];

    const expired = await expireStaleProposals(new Date());
    expect(expired).toBe(1);
    expect(p.status).toBe("expired");
    expect(p.outcomePrice).toBe(12);
    expect(typeof p.outcomeNote).toBe("string");
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1", kind: "expiry" });
  });

  it("skips (and does not notify for) a row approved after the sweep's read", async () => {
    const pending = row("tp-1", "pending");
    const approved = row("tp-2", "approved"); // approved between findMany and updateMany
    state.rows = [pending, approved];
    state.view = [pending, approved]; // the sweep read both while still pending

    const expired = await expireStaleProposals(new Date());
    expect(expired).toBe(1);
    expect(pending.status).toBe("expired");
    // The concurrently-approved proposal is untouched: no expiry flip, no note.
    expect(approved.status).toBe("approved");
    expect(approved.outcomePrice).toBeNull();
    expect(approved.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1" });
  });
});

const MINUTE_MS = 60_000;

/** A declined proposal whose horizon and (settled) undo window are in the past by default. */
function declinedRow(id: string, now: Date, overrides: Partial<Row> = {}): Row {
  return {
    id,
    userId: "u1",
    cardId: "c1",
    side: "sell",
    proposedPrice: 10,
    status: "declined",
    outcomePrice: null,
    outcomeNote: null,
    expiresAt: new Date(now.getTime() - 5 * MINUTE_MS),
    undoUntil: new Date(now.getTime() - 4 * MINUTE_MS),
    card: { name: "Test Card", marketStat: { currentPrice: 12 } },
    ...overrides,
  };
}

describe("recordDeclinedHindsight", () => {
  it("records hindsight for declined rows past their horizon and notifies exactly once each", async () => {
    const now = new Date();
    const p = declinedRow("tp-1", now);
    state.rows = [p];
    state.view = [p];

    const hindsights = await recordDeclinedHindsight(now);
    expect(hindsights).toBe(1);
    expect(p.status).toBe("declined"); // hindsight never changes status
    expect(p.outcomePrice).toBe(12);
    expect(typeof p.outcomeNote).toBe("string");
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1", kind: "hindsight" });

    // Second sweep is a no-op: the row already carries its note.
    const again = await recordDeclinedHindsight(new Date(now.getTime() + MINUTE_MS));
    expect(again).toBe(0);
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
  });

  it("leaves declined rows whose horizon is still in the future untouched", async () => {
    const now = new Date();
    const p = declinedRow("tp-1", now, { expiresAt: new Date(now.getTime() + 5 * MINUTE_MS) });
    state.rows = [p];
    state.view = [p];

    expect(await recordDeclinedHindsight(now)).toBe(0);
    expect(p.outcomePrice).toBeNull();
    expect(p.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
  });

  it("waits out a live undo window", async () => {
    const now = new Date();
    // Declined moments before expiry: horizon passed but the 5s undo is still live.
    const p = declinedRow("tp-1", now, { undoUntil: new Date(now.getTime() + 3000) });
    state.rows = [p];
    state.view = [p];

    expect(await recordDeclinedHindsight(now)).toBe(0);
    expect(p.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
  });

  it("skips rows that already carry an outcome note", async () => {
    const now = new Date();
    const p = declinedRow("tp-1", now, { outcomePrice: 11, outcomeNote: "Hindsight: already recorded." });
    state.rows = [p];
    state.view = [p];

    expect(await recordDeclinedHindsight(now)).toBe(0);
    expect(p.outcomePrice).toBe(11);
    expect(p.outcomeNote).toBe("Hindsight: already recorded.");
    expect(vi.mocked(dispatchNotification)).not.toHaveBeenCalled();
  });

  it("skips (and does not notify for) a row undone back to pending after the sweep's read", async () => {
    const now = new Date();
    const noted = declinedRow("tp-1", now);
    const undone = declinedRow("tp-2", now, { status: "pending", undoUntil: null }); // undone between findMany and updateMany
    state.rows = [noted, undone];
    state.view = [noted, undone]; // the sweep read both while still declined

    const hindsights = await recordDeclinedHindsight(now);
    expect(hindsights).toBe(1);
    expect(noted.outcomeNote).not.toBeNull();
    // The concurrently-undone proposal is untouched: no note, no notification.
    expect(undone.status).toBe("pending");
    expect(undone.outcomePrice).toBeNull();
    expect(undone.outcomeNote).toBeNull();
    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toMatchObject({ proposalId: "tp-1", kind: "hindsight" });
  });
});
