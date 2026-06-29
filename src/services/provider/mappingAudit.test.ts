import { describe, expect, it } from "vitest";

import { getMetadataProviderAdapter } from "@/services/provider/bootstrap";

const { PROVIDER_MODULES } = await import("@/services/provider/registry");

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
        "googlebooks",
        "icollect",
        "openlibrary",
        "picclick",
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
        "achatmoinscher",
        "apriloshop",
        "chipweld",
        "archichouette",
        "bcdjeux",
        "bedetheque",
        "booknode",
        "cestlejeu",
        "chasseauxlivres",
        "chocobonplan",
        "geedie",
        "coverproject",
        "didacto",
        "fairplayjeux",
        "freakxy",
        "icollect",
        "latelierdesjeux",
        "launchbox",
        "ledenicheur",
        "lepassetemps",
        "lesgentlemendujeu",
        "ludifolie",
        "ludocortex",
        "monsieurde",
        "okkazeo",
        "philibert",
        "picclick",
        "pricecharting",
        "scandex",
        "screenscraper",
        "smartoys",
        "thegamesdb",
        "tokyogamestory",
        "wikidata",
      ].sort(),
    );
  });

  it("registers raw-key collectors for metadata providers with live APIs", () => {
    const collectorIds = PROVIDER_MODULES.flatMap((mdl) =>
      mdl.collectMappingRawKeys ? [mdl.info.id] : [],
    );
    expect(collectorIds.sort()).toEqual(
      [
        "deezer",
        "discogs",
        "boardgamegeek",
        "googlebooks",
        "musicbrainz",
        "omdb",
        "openlibrary",
        "rawg",
        "scandex",
        "steam",
        "tmdb",
        "wikidata",
      ].sort(),
    );
  });
});
