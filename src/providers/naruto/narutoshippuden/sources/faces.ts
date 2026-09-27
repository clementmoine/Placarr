/**
 * Shippuden face ledgers — thin JSON wrappers.
 * Sources of truth: `curated/sources/mercari.json`, `curated/sources/fril.json`,
 * `curated/sources/ebay-*.json`.
 * Ingest rows use live CDN `url`; optional `curated` is offline fallback.
 */
import ebayCardjpstoreLedger from "../curated/sources/ebay-cardjpstore.json";
import ebayHmzkhytLedger from "../curated/sources/ebay-hmzkhyt.json";
import frilLedger from "../curated/sources/fril.json";
import mercariLedger from "../curated/sources/mercari.json";

export type ShippudenMercariFace = (typeof mercariLedger.faces)[number] & {
  ingest: true;
};

export type ShippudenFrilFace = (typeof frilLedger.faces)[number] & {
  ingest: true;
};

export type ShippudenEbayFace = {
  printedRef: string;
  diskId?: string;
  listingUrl: string;
  url: string;
  ingest: true;
  title?: string;
  note?: string;
};

export function shippudenMercariIngestFaces(): ShippudenMercariFace[] {
  return mercariLedger.faces.filter((row): row is ShippudenMercariFace => {
    if (row.ingest !== true) return false;
    const hasCurated =
      "curated" in row && typeof (row as { curated?: unknown }).curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}

export function shippudenFrilIngestFaces(): ShippudenFrilFace[] {
  return frilLedger.faces.filter((row): row is ShippudenFrilFace => {
    if (row.ingest !== true) return false;
    return typeof row.url === "string" && row.url.length > 0;
  });
}

export function shippudenEbayIngestFaces(): ShippudenEbayFace[] {
  const rows = [
    ...ebayCardjpstoreLedger.faces,
    ...ebayHmzkhytLedger.faces,
  ];
  return rows.filter((row): row is ShippudenEbayFace => {
    if (row.ingest !== true) return false;
    return typeof row.url === "string" && row.url.length > 0;
  });
}
