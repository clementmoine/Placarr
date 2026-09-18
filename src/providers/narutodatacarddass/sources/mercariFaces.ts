/**
 * Mercari pasted CDN assets for Data Carddass.
 * Source of truth: `curated/sources/mercari.json`.
 * Ingest rows use live mercdn `url`; optional `curated` is offline fallback.
 */
import ledger from "../curated/sources/mercari.json";

export type DataCarddassMercariFace = (typeof ledger.faces)[number];

export function dataCarddassMercariIngestFaces(): DataCarddassMercariFace[] {
  return ledger.faces.filter((row) => {
    if (!row.ingest) return false;
    const hasCurated =
      "curated" in row && typeof (row as { curated?: unknown }).curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}
