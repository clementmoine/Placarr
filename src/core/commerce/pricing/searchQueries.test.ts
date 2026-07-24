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

  it("adds a bare issue-number variant for magazine titles", () => {
    expect(
      buildPriceSearchQueries(["Les Trésors de Picsou n°63"], "Comics"),
    ).toEqual(["Les Trésors de Picsou 63", "Les Trésors de Picsou n°63"]);
  });

  it("adds spaced French interim-issue variants for bis titles", () => {
    expect(buildPriceSearchQueries(["Super Picsou Géant n°100bis"])).toEqual([
      "Super Picsou Géant 100bis",
      "Super Picsou Géant 100 bis",
      "Super Picsou Géant n°100 bis",
      "Super Picsou Géant n°100bis",
    ]);
  });

  it("strips parenthetical years used as remake disambiguators", () => {
    expect(buildPriceSearchQueries(["Resident Evil 4 (2023)"])).toEqual([
      "Resident Evil 4",
    ]);
    expect(
      buildPriceSearchQueries(["Inception (2010)"], "Bluray"),
    ).toEqual(expect.arrayContaining(["Inception bluray", "Inception"]));
    expect(
      buildPriceSearchQueries(["Inception (2010)"], "Bluray").some((q) =>
        q.includes("2010"),
      ),
    ).toBe(false);
  });
});
