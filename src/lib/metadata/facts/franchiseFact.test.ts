import { describe, expect, it } from "vitest";

import {
  FRANCHISE_FACT_KIND,
  buildFranchiseFact,
} from "@/lib/metadata/facts/franchiseFact";

describe("buildFranchiseFact", () => {
  it("builds a stable, type-agnostic franchise fact from a provider name", () => {
    expect(buildFranchiseFact("Final Fantasy", "igdb")).toEqual([
      {
        kind: FRANCHISE_FACT_KIND,
        label: "Franchise",
        value: "Final Fantasy",
        source: "igdb",
        confidence: 0.8,
        priority: 55,
      },
    ]);
  });

  it("trims whitespace from the provider name", () => {
    expect(buildFranchiseFact("  The Witcher  ", "igdb")[0]?.value).toBe(
      "The Witcher",
    );
  });

  it.each([null, undefined, "", "   "])(
    "returns nothing for an empty name (%p) so callers can spread safely",
    (name) => {
      expect(buildFranchiseFact(name, "tmdb")).toEqual([]);
    },
  );

  it("keeps the kind stable across sources (movie collection, game franchise)", () => {
    const movie = buildFranchiseFact("The Lord of the Rings Collection", "tmdb");
    const game = buildFranchiseFact("Halo", "igdb");
    expect(movie[0]?.kind).toBe(FRANCHISE_FACT_KIND);
    expect(game[0]?.kind).toBe(FRANCHISE_FACT_KIND);
  });
});
