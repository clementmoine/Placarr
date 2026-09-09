/**
 * eBay pasted CDN assets for Data Carddass.
 * Source of truth: `curated/sources/ebay.json`.
 */
import ledger from "../curated/sources/ebay.json";

export type DataCarddassEbayFace = (typeof ledger.faces)[number];

export function dataCarddassEbayListingImageFull(url: string): string {
  return url.replace(/\/s-l\d+\.(webp|jpe?g)$/i, "/s-l1600.$1");
}

export function dataCarddassEbayIngestFaces(): DataCarddassEbayFace[] {
  return ledger.faces.filter((row) => row.ingest);
}
