/**
 * Emporio di Milo IT Carddass packshots.
 * Source of truth: `curated/sources/emporiodimilo.json`.
 *
 * Product pages only (user paste). The shop search is not a scrape target.
 */
import ledger from "../curated/sources/emporiodimilo.json";

export type EmporiodimiloPackshot = (typeof ledger.products)[number];

export function emporiodimiloLedger() {
  return ledger;
}

export function emporiodimiloIngestPackshots(): EmporiodimiloPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}
