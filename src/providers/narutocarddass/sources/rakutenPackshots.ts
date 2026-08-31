/**
 * Rakuten FR pasted product packshots.
 * Source of truth: `curated/sources/rakuten.json` products[].
 *
 * Product pages / picture CDN 403 without browser session — paste only.
 */
import ledger from "../curated/sources/rakuten.json";

export type RakutenPackshot = (typeof ledger.products)[number];

export function rakutenPackshotLedger() {
  return ledger;
}

export function rakutenIngestPackshots(): RakutenPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "art");
}
