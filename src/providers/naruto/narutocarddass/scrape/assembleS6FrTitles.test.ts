import { describe, expect, it } from "vitest";

import {
  isNarutoS6FrPrintedNumber,
  keepsNarutoS6FrTitle,
} from "../sources/titles";

describe("S6 FR titles after IT re-enable", () => {
  it("keeps attested FR printed inserts on the s6 FR checklist", () => {
    expect(isNarutoS6FrPrintedNumber("ni0236")).toBe(true);
    expect(isNarutoS6FrPrintedNumber("ta0221")).toBe(true);
    // Italian Rivalità Eterna / Coleka — not FR retail.
    expect(isNarutoS6FrPrintedNumber("ni0267")).toBe(false);
    expect(isNarutoS6FrPrintedNumber("cl0033")).toBe(false);
  });

  it("also keeps carddass.fr preprod names (non-éditée) off the printed ledger", () => {
    expect(keepsNarutoS6FrTitle("ni0268")).toBe(true);
    expect(keepsNarutoS6FrTitle("te0267")).toBe(true);
    expect(isNarutoS6FrPrintedNumber("ni0268")).toBe(false);
    expect(keepsNarutoS6FrTitle("ni0267")).toBe(false);
  });
});
