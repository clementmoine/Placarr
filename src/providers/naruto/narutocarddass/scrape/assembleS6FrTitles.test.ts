import { describe, expect, it } from "vitest";

import { isNarutoS6FrPrintedNumber } from "../sources/titles";

describe("S6 FR titles after IT re-enable", () => {
  it("keeps only attested FR printed inserts on the s6 FR checklist", () => {
    expect(isNarutoS6FrPrintedNumber("ni0236")).toBe(true);
    expect(isNarutoS6FrPrintedNumber("ta0221")).toBe(true);
    // Italian Rivalità Eterna / Coleka — not FR retail.
    expect(isNarutoS6FrPrintedNumber("ni0267")).toBe(false);
    expect(isNarutoS6FrPrintedNumber("cl0033")).toBe(false);
  });
});
