import { buildMetadataAdapterMap } from "@/services/providerBootstrap";
import { cleanSearchQuery, formatScore } from "@/services/metadataSearchUtils";
import { createBGGResolver } from "@/services/providers/bgg/resolver";
import { fetchCoverFromCoverProject } from "@/services/providers/coverproject/resolver";
import { createDeezerResolver } from "@/services/providers/deezer/resolver";
import { createOMDbResolver } from "@/services/providers/omdb/resolver";
import { createGoogleBooksResolver } from "@/services/providers/googlebooks/resolver";
import { createOpenLibraryResolver } from "@/services/providers/openlibrary/resolver";
import { createPhilibertResolver } from "@/services/providers/philibert/resolver";
import {
  BCDJEUX_CONFIG,
  createPrestashopResolver,
  LEPASSETEMPS_CONFIG,
  LUDIFOLIE_CONFIG,
  MONSIEURDE_CONFIG,
} from "@/services/providers/prestashop";
import { createWikidataResolver } from "@/services/providers/wikidata/resolver";
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

export const fetchFromWikidata = createWikidataResolver();

export const fetchFromPhilibert = createPhilibertResolver();

export const fetchFromMonsieurde = createPrestashopResolver(MONSIEURDE_CONFIG);
export const fetchFromLudifolie = createPrestashopResolver(LUDIFOLIE_CONFIG);
export const fetchFromBcdjeux = createPrestashopResolver(BCDJEUX_CONFIG);
export const fetchFromLepassetemps =
  createPrestashopResolver(LEPASSETEMPS_CONFIG);

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
  fetchFromWikidata,
  fetchFromPhilibert,
  fetchFromMonsieurde,
  fetchFromLudifolie,
  fetchFromBcdjeux,
  fetchFromLepassetemps,
  fetchFromTMDB,
  fetchFromOMDb,
});

export function getMetadataProviderAdapter(
  id: string,
): MetadataProviderAdapter | undefined {
  return metadataProviderResolverMap.get(id);
}
