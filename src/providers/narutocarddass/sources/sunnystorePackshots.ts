/**
 * Sunny Store pasted Shopify packshots (art / back).
 * Source of truth: `curated/sources/sunnystore.json` products[].
 */
import ledger from "../curated/sources/sunnystore.json";

export type SunnystorePackshot = (typeof ledger.products)[number];

export function sunnystorePackshotLedger() {
  return ledger;
}

export function sunnystoreIngestPackshots(): SunnystorePackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "art");
}

export function sunnystoreIngestBacks(): SunnystorePackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "back");
}
