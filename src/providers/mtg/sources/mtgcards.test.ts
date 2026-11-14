import { describe, expect, it } from "vitest";

import {
  MTGCARDS_DETAIL_CATEGORIES,
  MTGCARDS_LISTING_CATEGORIES,
  MTGCARDS_SITE,
  MTGCARDS_STAGING_FOLDER,
} from "./mtgcards";

describe("mtgcards site", () => {
  it("points at mtgcards.fr sealed categories", () => {
    expect(MTGCARDS_SITE.origin).toBe("https://www.mtgcards.fr");
    expect(MTGCARDS_STAGING_FOLDER).toBe("mtgcards-products");
    expect(MTGCARDS_LISTING_CATEGORIES).toEqual([
      "commander-decks",
      "prerelease-packs",
    ]);
    expect(MTGCARDS_DETAIL_CATEGORIES).toEqual([
      "commander-decks",
      "prerelease-packs",
    ]);
  });
});
