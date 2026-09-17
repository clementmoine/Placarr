/**
 * Mercari pasted faces for 疾風伝.
 * Source of truth: `curated/sources/mercari.json`.
 * Ingest rows use live mercdn `url`; optional `curated` is offline fallback.
 */
import ledger from "../curated/sources/mercari.json";

export type ShippudenMercariFace = (typeof ledger.faces)[number] & {
  ingest: true;
};

export function shippudenMercariIngestFaces(): ShippudenMercariFace[] {
  return ledger.faces.filter((row): row is ShippudenMercariFace => {
    if (row.ingest !== true) return false;
    const hasCurated =
      "curated" in row && typeof (row as { curated?: unknown }).curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}
