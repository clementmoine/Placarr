/**
 * Shippuden face ledgers — thin JSON wrappers.
 * Synced under `data/naruto/shippuden/sources/` (mercari / fril / ebay-*).
 * Ingest rows use live CDN `url`; optional `curated` is offline fallback.
 */
import { readNarutoShippudenSyncedSource } from "../assets";

type FaceRow = {
  ingest?: boolean;
  url?: string;
  curated?: string;
  printedRef?: string;
  diskId?: string;
  listingUrl?: string;
  title?: string;
  note?: string;
  imageId?: string;
  [key: string]: unknown;
};

type FacesLedger = { faces: FaceRow[] };

const mercariLedger = readNarutoShippudenSyncedSource<FacesLedger>("mercari.json");
const frilLedger = readNarutoShippudenSyncedSource<FacesLedger>("fril.json");
const ebayCardjpstoreLedger = readNarutoShippudenSyncedSource<FacesLedger>(
  "ebay-cardjpstore.json",
);
const ebayHmzkhytLedger = readNarutoShippudenSyncedSource<FacesLedger>(
  "ebay-hmzkhyt.json",
);

export type ShippudenMercariFace = FaceRow & {
  ingest: true;
};

export type ShippudenFrilFace = FaceRow & {
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
  imageId?: string;
};

export function shippudenMercariIngestFaces(): ShippudenMercariFace[] {
  return mercariLedger.faces.filter((row): row is ShippudenMercariFace => {
    if (row.ingest !== true) return false;
    const hasCurated =
      "curated" in row && typeof row.curated === "string";
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
  return rows.filter((row): row is FaceRow & { ingest: true; printedRef: string; listingUrl: string; url: string } => {
    if (row.ingest !== true) return false;
    return (
      typeof row.url === "string" &&
      row.url.length > 0 &&
      typeof row.printedRef === "string" &&
      typeof row.listingUrl === "string"
    );
  }) as ShippudenEbayFace[];
}
