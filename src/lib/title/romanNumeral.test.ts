import { describe, expect, it } from "vitest";

import {
  buildRomanNumeralTitleVariants,
  parseRomanToken,
} from "./romanNumeral";

describe("romanNumeralText", () => {
  it("parses single roman tokens", () => {
    expect(parseRomanToken("vii")).toBe(7);
    expect(parseRomanToken("II")).toBe(2);
    expect(parseRomanToken("XLII")).toBe(42);
    expect(parseRomanToken("zelda")).toBeNull();
    expect(parseRomanToken("l")).toBeNull();
    expect(parseRomanToken("du")).toBeNull();
  });

  it("does not romanize french articles in full titles", () => {
    expect(buildRomanNumeralTitleVariants("La Légende Du Dragon")).toEqual([]);
  });

  it("derives arabic and roman variants for full titles", () => {
    expect(buildRomanNumeralTitleVariants("Final Fantasy VII")).toEqual([
      "Final Fantasy 7",
    ]);
    expect(
      buildRomanNumeralTitleVariants("Teenage Mutant Ninja Turtles 2"),
    ).toEqual(["Teenage Mutant Ninja Turtles II"]);
  });
});
