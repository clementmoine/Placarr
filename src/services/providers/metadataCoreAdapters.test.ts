import { describe, expect, it, vi } from "vitest";

import { PROVIDERS } from "@/services/providerRegistry";

import { createMetadataCoreAdapters } from "./metadataCoreAdapters";

describe("createMetadataCoreAdapters", () => {
  it("exposes stable ids for core metadata providers", () => {
    const adapters = createMetadataCoreAdapters({
      fetchFromScreenScraper: vi.fn(async () => null),
      fetchFromRawg: vi.fn(async () => null),
      fetchFromDeezer: vi.fn(async () => null),
      fetchFromBGG: vi.fn(async () => null),
      fetchFromOpenLibrary: vi.fn(async () => null),
      fetchFromTMDB: vi.fn(async () => null),
    });

    expect(adapters.map((adapter) => adapter.id)).toEqual([
      "screenscraper",
      "rawg",
      "deezer",
      "boardgamegeek",
      "openlibrary",
      "tmdb",
    ]);
  });

  it("maps every adapter to a declared provider", () => {
    const adapters = createMetadataCoreAdapters({
      fetchFromScreenScraper: vi.fn(async () => null),
      fetchFromRawg: vi.fn(async () => null),
      fetchFromDeezer: vi.fn(async () => null),
      fetchFromBGG: vi.fn(async () => null),
      fetchFromOpenLibrary: vi.fn(async () => null),
      fetchFromTMDB: vi.fn(async () => null),
    });

    for (const adapter of adapters) {
      const provider = PROVIDERS.find((candidate) => candidate.id === adapter.id);
      expect(provider).toBeDefined();
    }
  });
});
