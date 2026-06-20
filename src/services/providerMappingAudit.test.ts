import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/services/providerRegistry";
import { getMetadataProviderAdapter } from "@/services/metadataResolvers";

describe("provider mapping probes", () => {
  it("registers a probe path for every provider module", () => {
    for (const module of PROVIDER_MODULES) {
      expect(module.mappingProbe).toBeDefined();

      const hasAdapter = !!module.createMetadataAdapter;
      const hasCustomProbe = !!module.runMappingProbe;
      expect(hasAdapter || hasCustomProbe).toBe(true);
    }
  });

  it("keeps metadata adapter ids resolvable at runtime", () => {
    const adapterIds = PROVIDER_MODULES.flatMap((module) =>
      module.createMetadataAdapter ? [module.info.id] : [],
    );

    for (const id of adapterIds) {
      expect(getMetadataProviderAdapter(id)).toBeDefined();
    }
  });

  it("keeps the ScreenScraper mapping probe semantically aligned", () => {
    const module = PROVIDER_MODULES.find(
      (candidate) => candidate.info.id === "screenscraper",
    );

    expect(module?.mappingProbe?.sampleInput).toContain("Skyward Sword");
    expect(module?.mappingProbe?.context.name).toContain("Skyward Sword");
    expect(module?.mappingProbe?.context.platform).toBe("wii");
  });

  it("registers custom mapping probes for scrape/barcode providers", () => {
    const customProbeIds = PROVIDER_MODULES.flatMap((module) =>
      module.runMappingProbe ? [module.info.id] : [],
    );
    expect(customProbeIds.sort()).toEqual(
      [
        "achatmoinscher",
        "apriloshop",
        "archichouette",
        "bcdjeux",
        "chasseauxlivres",
        "coverproject",
        "freakxy",
        "launchbox",
        "ledenicheur",
        "lepassetemps",
        "ludifolie",
        "monsieurde",
        "philibert",
        "picclick",
        "pricecharting",
        "scandex",
        "thegamesdb",
        "wikidata",
      ].sort(),
    );
  });

  it("registers raw-key collectors for metadata providers with live APIs", () => {
    const collectorIds = PROVIDER_MODULES.flatMap((module) =>
      module.collectMappingRawKeys ? [module.info.id] : [],
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
