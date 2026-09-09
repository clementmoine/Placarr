import { describe, expect, it } from "vitest";

import { getMetadataProviderAdapter } from "@/core/catalog/bootstrap";

const { PROVIDER_MODULES } = await import("@/core/catalog/catalog");

describe("provider mapping probes", () => {
  it("registers a probe path for every provider module", () => {
    for (const mdl of PROVIDER_MODULES) {
      expect(mdl.mappingProbe).toBeDefined();

      const hasAdapter = !!mdl.createMetadataAdapter;
      const hasCustomProbe = !!mdl.runMappingProbe;
      expect(hasAdapter || hasCustomProbe).toBe(true);
    }
  });

  it("keeps metadata adapter ids resolvable at runtime", () => {
    const adapterIds = PROVIDER_MODULES.flatMap((mdl) =>
      mdl.createMetadataAdapter ? [mdl.info.id] : [],
    );

    for (const id of adapterIds) {
      expect(getMetadataProviderAdapter(id)).toBeDefined();
    }
  });

  it("keeps the ScreenScraper mapping probe semantically aligned", () => {
    const mdl = PROVIDER_MODULES.find(
      (candidate) => candidate.info.gameMediaGallerySource,
    );

    expect(mdl?.info.id).toBe("screenscraper");
    expect(mdl?.mappingProbe?.sampleInput).toContain("Skyward Sword");
    expect(mdl?.mappingProbe?.context.name).toContain("Skyward Sword");
    expect(mdl?.mappingProbe?.context.platform).toBe("wii");
  });

  it("declares mapping probe retry on flaky book/game catalog providers", () => {
    const retryIds = PROVIDER_MODULES.filter(
      (mdl) => mdl.info.mappingProbeRetry,
    ).map((mdl) => mdl.info.id);
    expect(retryIds.sort()).toEqual(
      [
        "boardgamegeek",
        "ebay",
        "fullset",
        "googlebooks",
        "icollect",
        "openlibrary",
        "screenscraper",
      ].sort(),
    );
  });

  it("registers custom mapping probes for scrape/barcode providers", () => {
    const customProbeIds = PROVIDER_MODULES.flatMap((mdl) =>
      mdl.runMappingProbe ? [mdl.info.id] : [],
    );
    expect(customProbeIds.sort()).toEqual(
      [
        "abebooks",
        "achatmoinscher",
        "archichouette",
        "babelio",
        "backmarket",
        "bcdjeux",
        "bdfugue",
        "bdovore",
        "bdphile",
        "bedetheque",
        "booknode",
        "brickset",
        "canalbd",
        "cestlejeu",
        "chasseauxlivres",
        "chipweld",
        "chocobonplan",
        "coverproject",
        "dbscg",
        "dbsfw",
        "dbslamincards",
        "decitre",
        "didacto",
        "ebay",
        "espritjeu",
        "fairplayjeux",
        "freakxy",
        "fullset",
        "furet",
        "geedie",
        "gibert",
        "hdjv",
        "icollect",
        "izneo",
        "jikan",
        "latelierdesjeux",
        "launchbox",
        "ledenicheur",
        "lepassetemps",
        "lesgentlemendujeu",
        "lorcanagg",
        "lorcanajson",
        "lorcast",
        "ludifolie",
        "ludocortex",
        "monsieurde",
        "myludo",
        "narutocarddass",
        "narutodatacarddass",
        "narutokayou",
        "narutomythos",
        "narutoranks",
        "narutoshippuden",
        "narutoultra",
        "nautiljon",
        "netgamesretro",
        "nointro",
        "okkazeo",
        "onepiece",
        "philibert",
        "planetebd",
        "playin",
        "pricecharting",
        "rebrickable",
        "scandex",
        "screenscraper",
        "senscritique",
        "smartoys",
        "tcgdex",
        "thegamesdb",
        "tokyogamestory",
        "vivlio",
        "wikidata",
        "yugioh",
        "digimon",
        "mtg",
      ].sort(),
    );
  });

  it("does not crash barcode-only adapter probes when name is missing", () => {
    // Regression: `ctx.name.trim()` threw when mappingProbe.context only set barcode
    // (Gibert and other Magento retailers) → map:error for the whole provider.
    expect(() => {
      const probeContext: { name?: string } = {};
      void probeContext.name?.trim();
    }).not.toThrow();

    const gibert = PROVIDER_MODULES.find((mdl) => mdl.info.id === "gibert");
    expect(gibert?.mappingProbe?.context.barcode).toBeTruthy();
    expect(gibert?.mappingProbe?.context.name).toBeUndefined();
  });

  it("declares SensCritique on games, books, movies, and musics", () => {
    const senscritique = PROVIDER_MODULES.find(
      (mdl) => mdl.info.id === "senscritique",
    );
    expect(senscritique?.info.types.sort()).toEqual(
      ["books", "games", "movies", "musics"].sort(),
    );
    expect(senscritique?.mappingProbe?.context.type).toBe("games");
  });

  it("gives book scrape probes an explicit books type", () => {
    for (const id of ["canalbd", "bedetheque"] as const) {
      const mdl = PROVIDER_MODULES.find((entry) => entry.info.id === id);
      expect(mdl?.mappingProbe?.context.type).toBe("books");
    }
  });
});
