import { describe, expect, it } from "vitest";
import {
  computeHindsight,
  expireProposal,
  isExpired,
  undoActive,
  undoDeadline,
  type ProposalLike,
} from "./expiry";

const NOW = new Date("2026-01-01T12:00:00Z");
function proposal(partial: Partial<ProposalLike> = {}): ProposalLike {
  return {
    side: "sell",
    status: "pending",
    proposedPrice: 100,
    expiresAt: new Date(NOW.getTime() + 30 * 60000),
    decidedAt: null,
    undoUntil: null,
    ...partial,
  };
}

describe("isExpired", () => {
  it("is true only for pending proposals past their expiry", () => {
    expect(isExpired(proposal({ expiresAt: new Date(NOW.getTime() - 1000) }), NOW)).toBe(true);
    expect(isExpired(proposal({ expiresAt: new Date(NOW.getTime() + 1000) }), NOW)).toBe(false);
    expect(isExpired(proposal({ status: "approved", expiresAt: new Date(NOW.getTime() - 1000) }), NOW)).toBe(false);
  });
});

describe("undo window", () => {
  it("is active until the 5-second deadline", () => {
    const decidedAt = NOW;
    const until = undoDeadline(decidedAt);
    expect(undoActive(proposal({ decidedAt, undoUntil: until }), new Date(NOW.getTime() + 4000))).toBe(true);
    expect(undoActive(proposal({ decidedAt, undoUntil: until }), new Date(NOW.getTime() + 6000))).toBe(false);
    expect(undoActive(proposal({ undoUntil: null }), NOW)).toBe(false);
  });
});

describe("computeHindsight", () => {
  it("BUY not taken: price up = missed, price down = dodged", () => {
    expect(computeHindsight("buy", 100, 110).verdict).toBe("missed");
    expect(computeHindsight("buy", 100, 90).verdict).toBe("dodged");
  });
  it("SELL not taken: price down = missed, price up = dodged", () => {
    expect(computeHindsight("sell", 100, 90).verdict).toBe("missed");
    expect(computeHindsight("sell", 100, 110).verdict).toBe("dodged");
  });
  it("treats a tiny move as flat", () => {
    expect(computeHindsight("sell", 100, 100.005).verdict).toBe("flat");
  });
  it("reports signed delta and a human note", () => {
    const h = computeHindsight("sell", 100, 90);
    expect(h.deltaAbs).toBe(-10);
    expect(h.deltaPct).toBeCloseTo(-10);
    expect(h.note).toContain("Hindsight");
  });
});

describe("expireProposal", () => {
  it("transitions to expired with an outcome snapshot", () => {
    const r = expireProposal(proposal({ side: "sell", proposedPrice: 100 }), 90);
    expect(r.status).toBe("expired");
    expect(r.outcomePrice).toBe(90);
    expect(r.outcomeNote).toContain("Hindsight");
  });
});
