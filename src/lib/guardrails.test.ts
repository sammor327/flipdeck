import { describe, expect, it } from "vitest";
import { checkProposalGuardrails } from "./guardrails";

const off = { killSwitch: false, dailySpendCap: 500 };

describe("checkProposalGuardrails — kill switch", () => {
  it("blocks buys when the kill switch is on", () => {
    const r = checkProposalGuardrails({ killSwitch: true, dailySpendCap: 500 }, "buy", 10, 0);
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/kill switch/i);
  });
  it("blocks sells when the kill switch is on", () => {
    expect(checkProposalGuardrails({ killSwitch: true, dailySpendCap: 0 }, "sell", 10, 0).blocked).toBe(true);
  });
});

describe("checkProposalGuardrails — daily spend cap", () => {
  it("blocks a buy that would push today's committed buys over the cap", () => {
    const r = checkProposalGuardrails(off, "buy", 100, 450); // 450 + 100 > 500
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/spend cap/i);
  });
  it("allows a buy that lands exactly on the cap", () => {
    expect(checkProposalGuardrails(off, "buy", 100, 400).blocked).toBe(false); // 400 + 100 = 500
  });
  it("allows a buy under the cap", () => {
    expect(checkProposalGuardrails(off, "buy", 50, 100).blocked).toBe(false);
  });
  it("never caps sells (it is a SPEND cap)", () => {
    expect(checkProposalGuardrails(off, "sell", 10000, 10000).blocked).toBe(false);
  });
  it("treats dailySpendCap <= 0 as no cap", () => {
    expect(checkProposalGuardrails({ killSwitch: false, dailySpendCap: 0 }, "buy", 99999, 99999).blocked).toBe(false);
    expect(checkProposalGuardrails({ killSwitch: false, dailySpendCap: -1 }, "buy", 99999, 99999).blocked).toBe(false);
  });
});

describe("checkProposalGuardrails — missing settings row", () => {
  it("blocks nothing for a user with no UserSettings row", () => {
    expect(checkProposalGuardrails(null, "buy", 99999, 99999).blocked).toBe(false);
    expect(checkProposalGuardrails(null, "sell", 99999, 0).blocked).toBe(false);
  });
});
