/**
 * Mercari / Rakuma / eBay pasted 忍 leads.
 * Source of truth: `curated/sources/mercari.json`.
 * Ingest rows use live mercdn `url`; optional `curated` is offline fallback.
 */
import ledger from "../curated/sources/mercari.json";

export type MercariFace = (typeof ledger.faces)[number];
export type MercariIngestFace = MercariFace & { ingest: true };

export function mercariLedger() {
  return ledger;
}

export function mercariIngestFaces(): MercariIngestFace[] {
  return ledger.faces.filter((row): row is MercariIngestFace => {
    if (row.ingest !== true) return false;
    const hasCurated =
      "curated" in row && typeof (row as { curated?: unknown }).curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}
