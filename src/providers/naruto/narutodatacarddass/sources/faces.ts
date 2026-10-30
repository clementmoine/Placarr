/**
 * Data Carddass face ledgers — thin JSON wrappers + host helpers.
 * Digs stay curated; crawl ledgers live under `data/naruto/data-carddass/sources/`.
 */

import { existsSync, readFileSync } from "node:fs";

import { narutoDataCarddassSourcePath } from "../pack";

type FaceRow = {
  ingest?: boolean;
  url?: string;
  curated?: string;
  [key: string]: unknown;
};

type FacesLedger = { faces: FaceRow[] };

function loadSyncedFacesLedger(fileName: string): FacesLedger {
  const p = narutoDataCarddassSourcePath(fileName);
  if (!existsSync(p)) return { faces: [] };
  return JSON.parse(readFileSync(p, "utf8")) as FacesLedger;
}

const ebayLedger = loadSyncedFacesLedger("ebay.json");
const frilLedger = loadSyncedFacesLedger("fril.json");
const mercariLedger = loadSyncedFacesLedger("mercari.json");
const tvTokyoLedger = loadSyncedFacesLedger("tvtokyo.json");

// ─── Chitoroshop (synced) ──────────────────────────────────────────────────

export type DataCarddassChitoroshopFace = FaceRow;

export function dataCarddassChitoroshopIngestFaces(): DataCarddassChitoroshopFace[] {
  return loadSyncedFacesLedger("chitoroshop.json").faces.filter(
    (row) => row.ingest !== false,
  );
}

// ─── Fril / ラクマ ──────────────────────────────────────────────────────────

export type DataCarddassFrilFace = FaceRow;

export function dataCarddassFrilIngestFaces(): DataCarddassFrilFace[] {
  return frilLedger.faces.filter((row) => row.ingest !== false);
}

// ─── TV Tokyo ──────────────────────────────────────────────────────────────

export type DataCarddassTvTokyoFace = FaceRow;

export function dataCarddassTvTokyoIngestFaces(): DataCarddassTvTokyoFace[] {
  return tvTokyoLedger.faces.filter((row) => row.ingest !== false);
}

// ─── eBay ──────────────────────────────────────────────────────────────────

export type DataCarddassEbayFace = FaceRow;

export function dataCarddassEbayListingImageFull(url: string): string {
  return url.replace(/\/s-l\d+\.(webp|jpe?g)$/i, "/s-l1600.$1");
}

export function dataCarddassEbayIngestFaces(): DataCarddassEbayFace[] {
  return ebayLedger.faces.filter((row) => row.ingest);
}

// ─── Mercari ───────────────────────────────────────────────────────────────

export type DataCarddassMercariFace = FaceRow;

export function dataCarddassMercariIngestFaces(): DataCarddassMercariFace[] {
  return mercariLedger.faces.filter((row) => {
    if (!row.ingest) return false;
    const hasCurated =
      "curated" in row && typeof row.curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}
