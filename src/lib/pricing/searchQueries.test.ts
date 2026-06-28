import { describe, expect, it } from "vitest";

import {
  buildPriceSearchQueries,
  physicalMediaHintsFromShelfName,
} from "./searchQueries";

describe("physicalMediaHintsFromShelfName", () => {
  it("derives bluray hints from shelf names", () => {
    expect(physicalMediaHintsFromShelfName("Bluray")).toEqual(["bluray"]);
    expect(physicalMediaHintsFromShelfName("Blu-ray 4K")).toEqual(["bluray"]);
  });

  it("derives dvd and music hints", () => {
    expect(physicalMediaHintsFromShelfName("DVD")).toEqual(["dvd"]);
    expect(physicalMediaHintsFromShelfName("Vinyles")).toEqual(["vinyl"]);
  });
});

describe("buildPriceSearchQueries", () => {
  it("puts media-specific queries before bare titles", () => {
    expect(
      buildPriceSearchQueries(["L'Etrange Noël De Monsieur Jack"], "Bluray"),
    ).toEqual([
      "L'Etrange Noël De Monsieur Jack bluray",
      "L'Etrange Noël De Monsieur Jack",
    ]);
  });

  it("deduplicates repeated names", () => {
    expect(buildPriceSearchQueries(["Inception", "Inception"], "DVD")).toEqual([
      "Inception dvd",
      "Inception",
    ]);
  });
});
