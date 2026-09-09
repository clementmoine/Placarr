/**
 * Vinted pasted CDN packshots.
 * Source of truth: `curated/sources/vinted.json`.
 *
 * Signed `images1.vinted.net` URLs only — do not crawl seller dressings.
 */
import ledger from "../curated/sources/vinted.json";

export type VintedPackshot = (typeof ledger.products)[number];

export function vintedLedger() {
  return ledger;
}

export function vintedIngestPackshots(): VintedPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "art");
}

export function vintedIngestBacks(): VintedPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "back");
}
