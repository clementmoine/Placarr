/**
 * Kinkai pasted product packshots (art / back).
 * Source of truth: `curated/sources/kinkai.json` products[].
 *
 * `kinkai.fr/uploads/` URLs only — do not crawl listings.
 */
import ledger from "../curated/sources/kinkai.json";

export type KinkaiPackshot = (typeof ledger.products)[number];

export function kinkaiPackshotLedger() {
  return ledger;
}

export function kinkaiIngestPackshots(): KinkaiPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "art");
}

export function kinkaiIngestBacks(): KinkaiPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "back");
}
