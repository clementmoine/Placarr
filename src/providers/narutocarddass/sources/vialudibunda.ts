/**
 * Via Ludibunda Magento packshots. Source of truth:
 * `curated/sources/vialudibunda.json`.
 *
 * Cache URLs (`/cache/{n}/image/700x700/{hash}/…`) are padded squares.
 * Catalogue wants the catalog original.
 */
import ledger from "../curated/sources/vialudibunda.json";

export type VialudibundaProduct = (typeof ledger.products)[number];

const MAGENTO_CACHE =
  /\/media\/catalog\/product\/cache\/[^/]+\/[^/]+\/\d+x\d+\/[a-f0-9]+(\/.+)$/i;

export function magentoCatalogOriginal(url: string): string {
  const match = MAGENTO_CACHE.exec(url);
  if (!match) return url;
  return url.replace(MAGENTO_CACHE, "/media/catalog/product$1");
}

export function vialudibundaLedger() {
  return ledger;
}

export function vialudibundaIngestPackshots(): VialudibundaProduct[] {
  return ledger.products.filter((row) => row.ingest);
}
