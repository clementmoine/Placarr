import { describe, expect, it } from "vitest";

import { dbscardsProductListingUrl } from "@/providers/shared/dbscards/parseProducts";

import {
  LORCARDS_DETAIL_CATEGORIES,
  LORCARDS_LISTING_CATEGORIES,
  LORCARDS_SITE,
  LORCARDS_STAGING_FOLDER,
} from "./lorcards";

describe("lorcards site", () => {
  it("is the same product path family as dbscards", () => {
    expect(LORCARDS_SITE.origin).toBe("https://www.lorcards.fr");
    expect(dbscardsProductListingUrl(LORCARDS_SITE.origin, "boosters", 2)).toBe(
      "https://www.lorcards.fr/products/boosters/2?language=ALL",
    );
  });

  it("opens boosters, blisters, decks, boxes, troves and puzzles, not displays", () => {
    expect(LORCARDS_LISTING_CATEGORIES).toContain("displays");
    expect(LORCARDS_DETAIL_CATEGORIES).not.toContain("displays");
    expect(LORCARDS_DETAIL_CATEGORIES).toEqual(
      expect.arrayContaining([
        "boosters",
        "boosters-blister",
        "decks",
        "collector-boxes",
        "illumineers-quest",
        "trove-packs",
        "puzzles",
      ]),
    );
    expect(LORCARDS_STAGING_FOLDER).toBe("lorcards-products");
  });
});
