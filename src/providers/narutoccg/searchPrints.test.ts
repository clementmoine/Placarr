import { describe, expect, it } from "vitest";

import { formatNarutoReference } from "./searchPrints";

describe("formatNarutoReference", () => {
  it("prints the number the way a collector reads it off the card", () => {
    expect(formatNarutoReference("s5", "ni232")).toBe("S5 · NI-232");
    expect(formatNarutoReference("promo", "te030")).toBe("PROMO · TE-030");
  });

  it("keeps a variant suffix rather than dropping it", () => {
    // `te030-cdf` is a distinct print, not a stray suffix to normalise away.
    expect(formatNarutoReference("promo", "te030-cdf")).toBe(
      "PROMO · TE-030-cdf",
    );
  });

  it("passes through a number it cannot parse instead of mangling it", () => {
    expect(formatNarutoReference("s1", "weird")).toBe("S1 · weird");
  });
});
