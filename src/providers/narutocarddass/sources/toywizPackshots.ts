/**
 * ToyWiz pasted CDN packshots. Source of truth: `curated/sources/toywiz.json`.
 */
import ledger from "../curated/sources/toywiz.json";

export type ToywizPackshot = (typeof ledger.products)[number];

export function toywizPackshotLedger() {
  return ledger;
}

export function toywizIngestPackshots(): ToywizPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}
