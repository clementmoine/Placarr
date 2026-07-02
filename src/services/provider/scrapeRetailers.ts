import { PRESTASHOP_RETAILER_MODULES } from "@/services/providers/prestashop";
import { SHOPIFY_RETAILER_MODULES } from "@/services/providers/shopify";
import type { MediaType } from "@/types/providerRegistry";

/** Scrape-catalog retailers (PrestaShop + Shopify) keyed for barcode lookups. */
export function scrapeCatalogRetailerLookupEntries(): Array<{
  lookupKey: string;
  providerName: string;
  types: MediaType[];
}> {
  return [...PRESTASHOP_RETAILER_MODULES, ...SHOPIFY_RETAILER_MODULES].map(
    (module) => ({
      lookupKey: module.info.id,
      providerName: module.evidence?.label ?? module.info.label,
      types: module.info.types,
    }),
  );
}
