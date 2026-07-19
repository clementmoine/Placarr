import { describe, expect, it } from "vitest";

import {
  CATALOG_REQUIRED_TITLE_MARKER_GROUPS,
  containsGameClassicsKeyword,
  createGameEditionMatcher,
  createNonGameMediaMatcher,
  createTermMatcher,
  LISTING_CONDITION_TERMS,
  LISTING_PHYSICAL_SHELF_FORMAT_TERMS,
  NON_CANONICAL_CONTEXT_TOKENS,
} from "@/core/identify/listingTerms";

describe("listingTerms", () => {
  it("matches shared edition markers", () => {
    expect(
      "Halo 2 - Player's Choice".match(createGameEditionMatcher()),
    ).toEqual(["Player's Choice"]);
  });

  it("matches accented listing terms without ASCII word-boundary bugs", () => {
    expect(
      "Jeu testé et fonctionnel".match(
        createTermMatcher(LISTING_CONDITION_TERMS),
      ),
    ).toEqual(["testé et fonctionnel"]);
  });

  it("detects classics keywords through the shared helper", () => {
    expect(containsGameClassicsKeyword("Ghost Recon 2 Classics")).toBe(true);
    expect(containsGameClassicsKeyword("Ghost Recon 2")).toBe(false);
  });

  it("matches non-game media carriers for game-shelf conflicts", () => {
    const matcher = createNonGameMediaMatcher("i");
    expect(matcher.test("La Mémoire dans la peau [Blu-ray]")).toBe(true);
    expect(matcher.test("Prince of Persia Trilogy")).toBe(false);
  });

  it("derives catalog-required edition markers from GAME_EDITION_DEFINITIONS", () => {
    const flat = CATALOG_REQUIRED_TITLE_MARKER_GROUPS.flat();
    expect(flat).toEqual(expect.arrayContaining(["goty", "game of the year"]));
    expect(flat).toEqual(expect.arrayContaining(["trilogy", "trilogie"]));
    expect(flat).toEqual(
      expect.arrayContaining(["special edition", "edition speciale"]),
    );
  });

  it("derives non-canonical context tokens from carriers", () => {
    expect(NON_CANONICAL_CONTEXT_TOKENS.has("cd")).toBe(true);
    expect(NON_CANONICAL_CONTEXT_TOKENS.has("soundtrack")).toBe(true);
    expect(NON_CANONICAL_CONTEXT_TOKENS.has("ost")).toBe(true);
    expect(NON_CANONICAL_CONTEXT_TOKENS.has("halo")).toBe(false);
  });

  it("derives physical shelf formats from format definitions", () => {
    expect(LISTING_PHYSICAL_SHELF_FORMAT_TERMS).toEqual(
      expect.arrayContaining(["dvd", "blu ray", "bluray", "4k"]),
    );
  });
});
