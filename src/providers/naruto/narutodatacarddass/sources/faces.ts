/**
 * Data Carddass face ledgers — thin JSON wrappers + host helpers.
 * Digs stay curated; crawl ledgers live under `data/naruto/data-carddass/sources/`.
 */

import { existsSync, readFileSync } from "node:fs";

import { narutoDataCarddassSourcePath } from "../pack";

/*
 * Lignes telles qu'écrites par les étapes Sync de chaque hôte (data/ seul,
 * pas de copie curated) : `printedRef` = numéro imprimé relevé sur l'annonce,
 * `printed` = numéro lu sur la page officielle / boutique.
 */
type FaceRowBase = {
  ingest?: boolean;
  title?: string;
  note?: string;
  diskId?: string;
};

type FrilFaceRow = FaceRowBase & {
  printedRef: string;
  listingUrl: string;
  imageUrl: string;
  curated: string;
};

type TvTokyoFaceRow = FaceRowBase & {
  printed: string;
  name: string;
  page: string;
  url: string;
  skill?: string | null;
};

type EbayFaceRow = FaceRowBase & {
  printedRef: string;
  url: string;
  imageId?: string;
  listing?: string;
  listingUrl?: string;
  staging?: string;
  lang?: string;
  seller?: string;
  set?: string;
};

type MercariFaceRow = FaceRowBase & {
  printedRef: string;
  listingUrl: string;
  url?: string;
  curated?: string;
};

type ChitoroshopFaceRow = FaceRowBase & {
  printed: string;
  url: string;
  handle?: string;
  productUrl?: string;
};

type FacesLedger<Row> = { faces: Row[] };

function loadSyncedFacesLedger<Row>(fileName: string): FacesLedger<Row> {
  const p = narutoDataCarddassSourcePath(fileName);
  if (!existsSync(p)) return { faces: [] };
  return JSON.parse(readFileSync(p, "utf8")) as FacesLedger<Row>;
}

const ebayLedger = loadSyncedFacesLedger<EbayFaceRow>("ebay.json");
const frilLedger = loadSyncedFacesLedger<FrilFaceRow>("fril.json");
const mercariLedger = loadSyncedFacesLedger<MercariFaceRow>("mercari.json");
const tvTokyoLedger = loadSyncedFacesLedger<TvTokyoFaceRow>("tvtokyo.json");

// ─── Chitoroshop (synced) ──────────────────────────────────────────────────

export type DataCarddassChitoroshopFace = ChitoroshopFaceRow;

export function dataCarddassChitoroshopIngestFaces(): DataCarddassChitoroshopFace[] {
  return loadSyncedFacesLedger<ChitoroshopFaceRow>(
    "chitoroshop.json",
  ).faces.filter((row) => row.ingest !== false);
}

// ─── Fril / ラクマ ──────────────────────────────────────────────────────────

export type DataCarddassFrilFace = FrilFaceRow;

export function dataCarddassFrilIngestFaces(): DataCarddassFrilFace[] {
  return frilLedger.faces.filter((row) => row.ingest !== false);
}

// ─── TV Tokyo ──────────────────────────────────────────────────────────────

export type DataCarddassTvTokyoFace = TvTokyoFaceRow;

export function dataCarddassTvTokyoIngestFaces(): DataCarddassTvTokyoFace[] {
  return tvTokyoLedger.faces.filter((row) => row.ingest !== false);
}

// ─── eBay ──────────────────────────────────────────────────────────────────

export type DataCarddassEbayFace = EbayFaceRow;

export function dataCarddassEbayListingImageFull(url: string): string {
  return url.replace(/\/s-l\d+\.(webp|jpe?g)$/i, "/s-l1600.$1");
}

export function dataCarddassEbayIngestFaces(): DataCarddassEbayFace[] {
  return ebayLedger.faces.filter((row) => row.ingest);
}

// ─── Mercari ───────────────────────────────────────────────────────────────

export type DataCarddassMercariFace = MercariFaceRow;

export function dataCarddassMercariIngestFaces(): DataCarddassMercariFace[] {
  return mercariLedger.faces.filter((row) => {
    if (!row.ingest) return false;
    const hasCurated =
      "curated" in row && typeof row.curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}
