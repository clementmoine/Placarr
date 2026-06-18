import type { MetadataResult } from "@/services/metadata";

import type { MetadataProviderAdapter } from "./types";

type MetadataCoreResolverDeps = {
  fetchFromScreenScraper: (
    name: string,
    barcode?: string | null,
    platform?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromRawg: (name: string) => Promise<MetadataResult | null>;
  fetchFromDeezer: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromBGG: (name: string) => Promise<MetadataResult | null>;
  fetchFromOpenLibrary: (
    name: string,
    barcode?: string | null,
  ) => Promise<MetadataResult | null>;
  fetchFromTMDB: (name: string) => Promise<MetadataResult | null>;
};

export function createMetadataCoreAdapters(
  deps: MetadataCoreResolverDeps,
): MetadataProviderAdapter[] {
  return [
    {
      id: "screenscraper",
      async resolve({ name, barcode, platform }) {
        return deps.fetchFromScreenScraper(name, barcode, platform);
      },
    },
    {
      id: "rawg",
      async resolve({ name }) {
        return deps.fetchFromRawg(name);
      },
    },
    {
      id: "deezer",
      async resolve({ name, barcode }) {
        return deps.fetchFromDeezer(name, barcode);
      },
    },
    {
      id: "boardgamegeek",
      async resolve({ name }) {
        return deps.fetchFromBGG(name);
      },
    },
    {
      id: "openlibrary",
      async resolve({ name, barcode }) {
        return deps.fetchFromOpenLibrary(name, barcode);
      },
    },
    {
      id: "tmdb",
      async resolve({ name }) {
        return deps.fetchFromTMDB(name);
      },
    },
  ];
}
