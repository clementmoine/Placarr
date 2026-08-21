/**
 * Martina’s Fumetti IT Carddass packshots.
 * Source of truth: `curated/sources/martina.json`.
 *
 * One product page. The shop search is not a scrape target.
 */
import ledger from "./curated/sources/martina.json";

export type MartinaPackshot = (typeof ledger.products)[number];

export function martinaLedger() {
  return ledger;
}

export function martinaIngestPackshots(): MartinaPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}
