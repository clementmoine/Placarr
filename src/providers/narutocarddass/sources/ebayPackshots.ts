/**
 * eBay pasted CDN assets. Source of truth: `curated/sources/ebay.json`.
 *
 * `s-l1600` is the working large size. `s-l2048` on this dump is a stub.
 * Do not crawl listings or seller stores — only URLs in the ledger.
 */
import ledger from "../curated/sources/ebay.json";

export type EbayPackshot = (typeof ledger.products)[number];
export type EbayFace = (typeof ledger.faces)[number];

export function ebayListingImageFull(url: string): string {
  return url.replace(/\/s-l\d+\.(webp|jpe?g)$/i, "/s-l1600.$1");
}

export function ebayPackshotLedger() {
  return ledger;
}

export function ebayIngestPackshots(): EbayPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}

export function ebayIngestFaces(): EbayFace[] {
  return ledger.faces.filter((row) => row.ingest);
}
