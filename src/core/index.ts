/**
 * Core public surface — import from here for cross-cutting entry points.
 * Internal modules stay addressable via `@/core/<pillar>/…` for focused work.
 */
export { resolveBarcode } from "@/core/identify/resolver";
export { normalizeProductBarcode } from "@/core/identify/normalize";
export {
  getMetadata,
  fetchAndStoreMetadata,
  getDatabaseSuggestions,
} from "@/core/enrich";
export {
  persistBarcodePrices,
  getCachedItemPrices,
} from "@/core/commerce/pricing/resolver";
export {
  PROVIDERS,
  PROVIDER_MODULES,
  getProviderModule,
} from "@/core/catalog/catalog";
