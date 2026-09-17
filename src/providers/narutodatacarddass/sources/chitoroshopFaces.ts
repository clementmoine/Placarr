/**
 * Chitoroshop pasted Shopify CDN assets for Data Carddass.
 * Source of truth: `curated/sources/chitoroshop.json`.
 */
import ledger from "../curated/sources/chitoroshop.json";

export type DataCarddassChitoroshopFace = (typeof ledger.faces)[number];

export function dataCarddassChitoroshopIngestFaces(): DataCarddassChitoroshopFace[] {
  return ledger.faces.filter((row) => row.ingest !== false);
}
