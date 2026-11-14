import { PROVIDERS } from "@/core/catalog/catalog";

/**
 * Scrape retailers whose product images are served on the shop domain.
 * Derived from the registry: each provider declares
 * `info.scrapeCatalogImageBaseUrl`, core no longer keeps a list of shops.
 */
export const DEDICATED_CATALOG_IMAGE_HOSTS = PROVIDERS.filter(
  (provider) => provider.scrapeCatalogImageBaseUrl,
).map((provider) => ({ baseUrl: provider.scrapeCatalogImageBaseUrl! }));
