import { buildMetadataAdapterMap } from "@/services/providerBootstrap";
import { cleanSearchQuery, formatScore } from "@/services/metadataSearchUtils";
import { createBGGResolver } from "@/services/providers/bgg/resolver";
import { fetchCoverFromCoverProject } from "@/services/providers/coverproject/resolver";
import { createDeezerResolver } from "@/services/providers/deezer/resolver";
import { createOMDbResolver } from "@/services/providers/omdb/resolver";
import { createGoogleBooksResolver } from "@/services/providers/googlebooks/resolver";
import { createOpenLibraryResolver } from "@/services/providers/openlibrary/resolver";
import { createRawgResolver } from "@/services/providers/rawg/resolver";
import { createScreenScraperResolver } from "@/services/providers/screenscraper/resolver";
import { createTMDBResolver } from "@/services/providers/tmdb/resolver";

import type { MetadataProviderAdapter } from "@/types/providerModule";

export { cleanSearchQuery, formatScore } from "@/services/metadataSearchUtils";

export const fetchFromScreenScraper = createScreenScraperResolver({
  cleanSearchQuery,
  formatScore,
});

export const fetchFromRawg = createRawgResolver({
  formatScore,
  fetchCoverFromCoverProject,
});

export const fetchFromBGG = createBGGResolver({ formatScore });

export const fetchFromOpenLibrary = createOpenLibraryResolver();

export const fetchFromGoogleBooks = createGoogleBooksResolver();

export const fetchFromTMDB = createTMDBResolver({
  formatScore,
  cleanSearchQuery,
});

export const fetchFromOMDb = createOMDbResolver();

export const fetchFromDeezer = createDeezerResolver();

export const metadataProviderResolverMap = buildMetadataAdapterMap({
  fetchFromScreenScraper,
  fetchFromRawg,
  fetchFromDeezer,
  fetchFromBGG,
  fetchFromOpenLibrary,
  fetchFromGoogleBooks,
  fetchFromTMDB,
  fetchFromOMDb,
});

export function getMetadataProviderAdapter(
  id: string,
): MetadataProviderAdapter | undefined {
  return metadataProviderResolverMap.get(id);
}
