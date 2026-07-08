// Race-safety test for the expiry sweep: expireStaleProposals must claim each
// row with a status:"pending" guard, so it can never flip a proposal that was
// approved (inventory effects applied!) between its read and its write — and
// must not send an expiry notification for rows it did not transition.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const { state } = vi.hoisted(() => ({
  state: { rows: [] as Row[], view: [] as Row[] },
}));

vi.mock("../db", () => ({
  prisma: {
    tradeProposal: {
      // Returns the pre-canned sweep view, so a test can hand the sweep a row
      // another actor approved after the read — the exact race under test.
      findMany: async () => state.view,
      updateMany: async ({ where, data }: any) => {
        const hits = state.rows.filter((r) => r.id === where.id && r.status === where.status);
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
    },
  },
}));

vi.mock("../notifications/dispatch", () => ({ dispatchNotification: vi.fn(async () => undefined) }));

import { dispatchNotification } from "../notifications/dispatch";
import { expireStaleProposals } from "./tick";

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
