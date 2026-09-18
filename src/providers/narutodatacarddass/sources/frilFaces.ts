/**
 * Fril / ラクマ pasted faces for Data Carddass.
 * Source of truth: `curated/sources/fril.json` + curated `source.fril.jpg`.
 */
import ledger from "../curated/sources/fril.json";

export type DataCarddassFrilFace = (typeof ledger.faces)[number];

export function dataCarddassFrilIngestFaces(): DataCarddassFrilFace[] {
  return ledger.faces.filter((row) => row.ingest !== false);
}
