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
        "coverproject",
        "deezer",
        "didacto",
        "discogs",
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
        "musicbrainz",
        "okkazeo",
        "omdb",
        "openlibrary",
        "philibert",
        "picclick",
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
});

describe("getMetadataProviderAdapter", () => {
  it("returns wrapped adapters from the live registry map", () => {
    const adapter = getMetadataProviderAdapter("tmdb");
    expect(adapter?.id).toBe("tmdb");
  });
});
