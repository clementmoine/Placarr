import { describe, expect, it, vi } from "vitest";

import { createMetadataAdapters } from "@/services/providerBootstrap";
import { PROVIDERS } from "@/services/providerRegistry";

describe("createMetadataAdapters", () => {
  const deps = {
    fetchFromScreenScraper: vi.fn(async () => null),
    fetchFromRawg: vi.fn(async () => null),
    fetchFromDeezer: vi.fn(async () => null),
    fetchFromBGG: vi.fn(async () => null),
    fetchFromOpenLibrary: vi.fn(async () => null),
    fetchFromGoogleBooks: vi.fn(async () => null),
    fetchFromTMDB: vi.fn(async () => null),
    fetchFromOMDb: vi.fn(async () => null),
  };

  it("exposes stable ids for metadata providers", () => {
    const adapters = createMetadataAdapters(deps);

    expect(adapters.map((adapter) => adapter.id).sort()).toEqual(
      [
        "boardgamegeek",
        "deezer",
        "discogs",
        "googlebooks",
        "howlongtobeat",
        "igdb",
        "musicbrainz",
        "omdb",
        "openlibrary",
        "rawg",
        "screenscraper",
        "steam",
        "steamgriddb",
        "tmdb",
      ].sort(),
    );
  });

  it("maps every adapter to a declared provider", () => {
    const adapters = createMetadataAdapters(deps);

    for (const adapter of adapters) {
      const provider = PROVIDERS.find((candidate) => candidate.id === adapter.id);
      expect(provider).toBeDefined();
    }
  });
});
