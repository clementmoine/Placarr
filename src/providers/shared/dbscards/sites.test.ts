import { describe, expect, it } from "vitest";

import { DBSCARDS_SITES } from "./list";
import {
  isTcgCardsSiteId,
  TCGCARDS_SITES,
  tcgCardsCategoryRole,
  tcgCardsCrawlableSites,
  tcgCardsDetailCategories,
  tcgCardsListingCategories,
  tcgCardsSiteForPack,
} from "./sites";

describe("TCG Cards family", () => {
  it("keeps DBS card-list origins on the same hosts as the product rows", () => {
    expect(TCGCARDS_SITES.masters.origin).toBe(DBSCARDS_SITES.masters.origin);
    expect(TCGCARDS_SITES.fusion.origin).toBe(DBSCARDS_SITES.fusion.origin);
  });

  it("crawls only sites that have a local pack", () => {
    const crawled = tcgCardsCrawlableSites().map((site) => site.id);
    expect(crawled).toEqual([
      "masters",
      "fusion",
      "lorcards",
      "pkmcards",
      "opecards",
      "ygocards",
      "mtgcards",
    ]);
    expect(TCGCARDS_SITES.fabcards.packId).toBeNull();
  });

  it("never lists accessories, and never opens displays", () => {
    for (const site of Object.values(TCGCARDS_SITES)) {
      const listing = tcgCardsListingCategories(site);
      const detail = tcgCardsDetailCategories(site);
      expect(listing).not.toContain("playmats");
      expect(listing).not.toContain("card-sleeves");
      expect(listing).not.toContain("storage-boxes");
      expect(detail).not.toContain("displays");
      if (listing.includes("displays")) {
        expect(tcgCardsCategoryRole("displays")).toBe("index");
      }
      for (const category of listing) {
        expect(tcgCardsCategoryRole(category)).not.toBe("skip");
      }
    }
  });

  it("opens a booster for the labelled preview, not the chapter dump", () => {
    expect(tcgCardsCategoryRole("boosters")).toBe("preview");
    expect(tcgCardsCategoryRole("boosters-blister")).toBe("preview");
    expect(tcgCardsDetailCategories("lorcards")).toContain("boosters");
  });

  it("records the sealed categories each crawled host actually publishes", () => {
    expect(tcgCardsListingCategories("masters")).toEqual([
      "boosters",
      "displays",
      "decks",
      "collector-boxes",
      "special-packs",
    ]);
    expect(tcgCardsListingCategories("lorcards")).toEqual(
      expect.arrayContaining([
        "boosters-blister",
        "illumineers-quest",
        "trove-packs",
        // Publié par le site, jamais déclaré : deux packs avant-première
        // (Set 13 Invasion épineuse, Set 14 Hyperia City) restaient invisibles.
        "prerelease-packs",
        "puzzles",
      ]),
    );
    expect(tcgCardsCategoryRole("illumineers-quest")).toBe("detail");
    expect(tcgCardsListingCategories("pkmcards")).toEqual(
      expect.arrayContaining([
        "elite-trainer",
        "minitins",
        "pokebox",
        "tripacks",
      ]),
    );
    expect(tcgCardsListingCategories("opecards")).toEqual(
      expect.arrayContaining(["double-packs", "tins", "decks"]),
    );
    expect(tcgCardsListingCategories("ygocards")).toEqual([
      "boosters",
      "displays",
    ]);
    expect(tcgCardsListingCategories("mtgcards")).toEqual([
      "commander-decks",
      "prerelease-packs",
    ]);
    expect(tcgCardsListingCategories("mtgcards")).not.toContain("boosters");
    expect(isTcgCardsSiteId("pkmcards")).toBe(true);
    expect(isTcgCardsSiteId("dbscards")).toBe(false);
  });

  it("resolves a crawled pack back to its TCG Cards host", () => {
    expect(tcgCardsSiteForPack("lorcana")?.id).toBe("lorcards");
    expect(tcgCardsSiteForPack("pokemon")?.id).toBe("pkmcards");
    expect(tcgCardsSiteForPack("dbs/cg")?.id).toBe("masters");
    expect(tcgCardsSiteForPack("naruto/carddass")).toBeNull();
  });
});
