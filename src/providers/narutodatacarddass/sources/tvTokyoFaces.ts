/**
 * TV Tokyo official assets for Naruto Data Carddass (dcard_00.html to dcard_03.html).
 * Source of truth: `curated/sources/tvtokyo.json`.
 */
import ledger from "../curated/sources/tvtokyo.json";

export type DataCarddassTvTokyoFace = (typeof ledger.faces)[number];

export function dataCarddassTvTokyoIngestFaces(): DataCarddassTvTokyoFace[] {
  return ledger.faces.filter((row) => row.ingest !== false);
}
