import { describe, expect, it } from "vitest";
import { DEFAULT_FEE_PROFILES } from "./constants";
import { mergeFeeProfiles, sanitizeFeeProfileOverrides } from "./feeProfiles";

const ebayOverride = { feePct: 10, paymentFeePct: 1.5, shippingFlat: 2 };

describe("mergeFeeProfiles", () => {
  it("returns pure defaults for null/undefined/empty/garbage JSON", () => {
    expect(mergeFeeProfiles(null)).toEqual(DEFAULT_FEE_PROFILES);
    expect(mergeFeeProfiles(undefined)).toEqual(DEFAULT_FEE_PROFILES);
    expect(mergeFeeProfiles("")).toEqual(DEFAULT_FEE_PROFILES);
    expect(mergeFeeProfiles("not json {{")).toEqual(DEFAULT_FEE_PROFILES);
    expect(mergeFeeProfiles("42")).toEqual(DEFAULT_FEE_PROFILES);
  });

  it("merges a partial override and keeps defaults for the rest", () => {
    const merged = mergeFeeProfiles(JSON.stringify({ ebay: ebayOverride }));
    expect(merged.ebay).toEqual(ebayOverride);
    expect(merged.tcgplayer).toEqual(DEFAULT_FEE_PROFILES.tcgplayer);
    expect(merged.cardmarket).toEqual(DEFAULT_FEE_PROFILES.cardmarket);
  });

  it("rejects overrides with missing or non-finite fields (no NaN poisoning)", () => {
    const merged = mergeFeeProfiles(
      JSON.stringify({
        ebay: { feePct: 10 }, // missing fields
        tcgplayer: { feePct: "12", paymentFeePct: 2, shippingFlat: 1 }, // string
        cardmarket: { feePct: NaN, paymentFeePct: 2, shippingFlat: 1 }, // NaN serializes to null
      })
    );
    expect(merged).toEqual(DEFAULT_FEE_PROFILES);
  });

  it("never mutates DEFAULT_FEE_PROFILES", () => {
    const before = { ...DEFAULT_FEE_PROFILES };
    const merged = mergeFeeProfiles(JSON.stringify({ ebay: ebayOverride }));
    merged.tcgplayer = ebayOverride;
    expect(DEFAULT_FEE_PROFILES).toEqual(before);
  });
});

describe("sanitizeFeeProfileOverrides", () => {
  it("keeps a complete valid override", () => {
    expect(sanitizeFeeProfileOverrides({ ebay: ebayOverride })).toEqual({ ebay: ebayOverride });
  });

  it("drops partial profiles (missing fields)", () => {
    expect(sanitizeFeeProfileOverrides({ tcgplayer: { feePct: 12 } })).toEqual({});
  });

  it("drops unknown marketplace keys", () => {
    expect(sanitizeFeeProfileOverrides({ amazon: ebayOverride })).toEqual({});
  });

  it("drops profiles with non-finite or non-numeric fields", () => {
    expect(sanitizeFeeProfileOverrides({ ebay: { feePct: NaN, paymentFeePct: 1, shippingFlat: 0 } })).toEqual({});
    expect(sanitizeFeeProfileOverrides({ ebay: { feePct: Infinity, paymentFeePct: 1, shippingFlat: 0 } })).toEqual({});
    expect(sanitizeFeeProfileOverrides({ ebay: { feePct: "10", paymentFeePct: 1, shippingFlat: 0 } })).toEqual({});
  });

  it("strips extraneous fields from a kept profile", () => {
    expect(sanitizeFeeProfileOverrides({ ebay: { ...ebayOverride, sneaky: "extra" } })).toEqual({ ebay: ebayOverride });
  });

  it("returns an empty object for non-object input", () => {
    expect(sanitizeFeeProfileOverrides(null)).toEqual({});
    expect(sanitizeFeeProfileOverrides(undefined)).toEqual({});
    expect(sanitizeFeeProfileOverrides(42)).toEqual({});
    expect(sanitizeFeeProfileOverrides("ebay")).toEqual({});
  });
});
