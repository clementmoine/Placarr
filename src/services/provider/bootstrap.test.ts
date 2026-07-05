import { describe, expect, it } from "vitest";

import {
  createMetadataAdapters,
  getMetadataProviderAdapter,
} from "@/services/provider/bootstrap";

const { PROVIDERS } = await import("@/services/provider/registry");

describe("createMetadataAdapters", () => {
  it("exposes stable ids for metadata providers", () => {
    const adapters = createMetadataAdapters();

    expect(adapters.map((adapter) => adapter.id).sort()).toEqual(
      [
        "achatmoinscher",
        "apriloshop",
        "chipweld",
        "archichouette",
        "bcdjeux",
        "bedetheque",
        "booknode",
        "boardgamegeek",
        "cestlejeu",
        "chasseauxlivres",
        "chocobonplan",
        "geedie",
        "hdjv",
        "coverproject",
        "deezer",
        "didacto",
        "discogs",
        "ebay",
        "espritjeu",
        "fairplayjeux",
        "googlebooks",
        "howlongtobeat",
        "icollect",
        "igdb",
        "latelierdesjeux",
        "launchbox",
        "lepassetemps",
        "lesgentlemendujeu",
        "ludifolie",
        "ludocortex",
        "monsieurde",
        "netgamesretro",
        "musicbrainz",
        "myludo",
        "okkazeo",
        "omdb",
        "openlibrary",
        "philibert",
        "playin",
        "pricecharting",
        "rawg",
        "screenscraper",
        "steam",
        "steamgriddb",
        "thegamesdb",
        "tmdb",
        "tokyogamestory",
        "wikidata",
      ].sort(),
    );
  });

  it("maps every adapter to a declared provider", () => {
    const adapters = createMetadataAdapters();

    for (const adapter of adapters) {
      const provider = PROVIDERS.find(
        (candidate) => candidate.id === adapter.id,
      );
      expect(provider).toBeDefined();
    }
  });

  it("reads metadata traits from module self-declaration (PrestaShop configs + modules)", () => {
    const chipweld = PROVIDERS.find((p) => p.id === "chipweld");
    const netgamesretro = PROVIDERS.find((p) => p.id === "netgamesretro");
    const chocobonplan = PROVIDERS.find((p) => p.id === "chocobonplan");
    const chasseauxlivres = PROVIDERS.find((p) => p.id === "chasseauxlivres");

    expect(chipweld?.isSecondary).toBe(true);
    expect(chipweld?.isRealBoxCover).toBe(true);
    expect(netgamesretro?.strictShelfPlatformCover).toBe(true);
    expect(netgamesretro?.retailCatalogImageTitles).toBe(true);
    expect(chocobonplan?.bookGallerySource).toBe(true);
    expect(chasseauxlivres?.bookGallerySource).toBe(true);
  });
});

describe("getMetadataProviderAdapter", () => {
  it("returns wrapped adapters from the live registry map", () => {
    const adapter = getMetadataProviderAdapter("tmdb");
    expect(adapter?.id).toBe("tmdb");
  });
});
