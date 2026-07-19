import { describe, expect, it } from "vitest";

import {
  expandPriceChartingFranchiseStemTitles,
  expandPriceChartingLookupTitles,
} from "./lookupTitles";

describe("expandPriceChartingFranchiseStemTitles", () => {
  it("emits Yellow stem from the Special Pikachu Edition shelf title", () => {
    const stems = expandPriceChartingFranchiseStemTitles(
      "Pokémon Yellow Version: Special Pikachu Edition",
    );
    expect(stems.some((title) => /^pokémon yellow version$/i.test(title))).toBe(
      true,
    );
    expect(stems.some((title) => /^pokémon yellow$/i.test(title))).toBe(true);
  });

  it("does not invent a one-token stem", () => {
    expect(expandPriceChartingFranchiseStemTitles("Tetris")).toEqual([]);
  });
});

describe("expandPriceChartingLookupTitles", () => {
  it("includes Pokemon Yellow so PriceCharting search can hit the catalog", () => {
    const variants = expandPriceChartingLookupTitles(
      "Pokémon Yellow Version: Special Pikachu Edition",
    );
    expect(
      variants.some((title) => /^pokémon yellow$/i.test(title)),
    ).toBe(true);
  });
});
