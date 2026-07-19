/**
 * Credentialed remote media fetch helpers. Catalog is the only core surface
 * allowed to import provider modules — API routes use this facade.
 */
export {
  resolveScreenScraperCoverFallback,
  screenScraperMediaFetchUrl,
} from "@/providers/screenscraper/mediaProxy.server";
