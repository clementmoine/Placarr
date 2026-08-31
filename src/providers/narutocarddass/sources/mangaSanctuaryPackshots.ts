/**
 * Manga Sanctuary news 7397 — Carddass FR S5 press packshots.
 * Source of truth: `curated/sources/manga-sanctuary-packshots.json`.
 */
import ledger from "../curated/sources/manga-sanctuary-packshots.json";

export type MangaSanctuaryPackshot = (typeof ledger.products)[number];

export function mangaSanctuaryPackshotLedger() {
  return ledger;
}

export function mangaSanctuaryIngestPackshots(): MangaSanctuaryPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}
