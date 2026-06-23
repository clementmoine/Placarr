import { describe, expect, it } from "vitest";

import {
  containsGameClassicsKeyword,
  createGameEditionMatcher,
  createTermMatcher,
  LISTING_CONDITION_TERMS,
} from "@/lib/barcode/listingTerms";

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
});
