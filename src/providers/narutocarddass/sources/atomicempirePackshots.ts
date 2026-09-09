/**
 * Atomic Empire pasted CDN packshots.
 * Source of truth: `curated/sources/atomicempire.json`.
 */
import ledger from "../curated/sources/atomicempire.json";

export type AtomicEmpirePackshot = (typeof ledger.products)[number];

export function atomicempirePackshotLedger() {
  return ledger;
}

export function atomicempireIngestPackshots(): AtomicEmpirePackshot[] {
  return ledger.products.filter((row) => row.ingest);
}
