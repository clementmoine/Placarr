import { describe, expect, it } from "vitest";

import { computeCapabilityRisk } from "./providerCoverage";

describe("computeCapabilityRisk", () => {
  const keyOnly = new Map([
    ["tmdb", "key"],
    ["omdb", "key"],
  ] as const);
  const boardgamesRating = new Map([
    ["boardgamegeek", "key"],
    ["philibert", "scrape"],
  ] as const);
  const boardgamesReleaseDate = new Map([
    ["boardgamegeek", "key"],
    ["wikidata", "none"],
  ] as const);

  it("marks capabilities with no declared providers as n/a", () => {
    expect(computeCapabilityRisk([], [])).toBe("n/a");
  });

  it("marks zero configured providers as missing when providers exist", () => {
    expect(computeCapabilityRisk(["tmdb", "omdb"], [])).toBe("missing");
  });

  it("marks ok when only one provider exists and is configured", () => {
    expect(
      computeCapabilityRisk(
        ["howlongtobeat"],
        ["howlongtobeat"],
        new Map([["howlongtobeat", "scrape"]]),
      ),
    ).toBe("ok");
  });

  it("marks single-source when multiple key providers exist but only one is configured", () => {
    expect(computeCapabilityRisk(["tmdb", "omdb"], ["tmdb"], keyOnly)).toBe(
      "single-source",
    );
  });

  it("marks ok when multiple configured providers exist", () => {
    expect(computeCapabilityRisk(["tmdb", "omdb"], ["tmdb", "omdb"])).toBe(
      "ok",
    );
  });

  it("ne compte pas BGG non configuré comme single-source si Philibert est actif", () => {
    expect(
      computeCapabilityRisk(
        ["boardgamegeek", "philibert"],
        ["philibert"],
        boardgamesRating,
      ),
    ).toBe("ok");
  });

  it("ne compte pas BGG non configuré comme single-source si Wikidata est actif", () => {
    expect(
      computeCapabilityRisk(
        ["boardgamegeek", "wikidata"],
        ["wikidata"],
        boardgamesReleaseDate,
      ),
    ).toBe("ok");
  });
});
