/**
 * Data Carddass face ledgers — thin JSON wrappers + host helpers.
 * One file for install / tests; curated JSON paths unchanged.
 */

import chitoroshopLedger from "../curated/sources/chitoroshop.json";
import ebayLedger from "../curated/sources/ebay.json";
import frilLedger from "../curated/sources/fril.json";
import mercariLedger from "../curated/sources/mercari.json";
import tvTokyoLedger from "../curated/sources/tvtokyo.json";

// ─── Chitoroshop ───────────────────────────────────────────────────────────

export type DataCarddassChitoroshopFace =
  (typeof chitoroshopLedger.faces)[number];

export function dataCarddassChitoroshopIngestFaces(): DataCarddassChitoroshopFace[] {
  return chitoroshopLedger.faces.filter((row) => row.ingest !== false);
}

// ─── Fril / ラクマ ──────────────────────────────────────────────────────────

export type DataCarddassFrilFace = (typeof frilLedger.faces)[number];

export function dataCarddassFrilIngestFaces(): DataCarddassFrilFace[] {
  return frilLedger.faces.filter((row) => row.ingest !== false);
}

// ─── TV Tokyo ──────────────────────────────────────────────────────────────

export type DataCarddassTvTokyoFace = (typeof tvTokyoLedger.faces)[number];

export function dataCarddassTvTokyoIngestFaces(): DataCarddassTvTokyoFace[] {
  return tvTokyoLedger.faces.filter((row) => row.ingest !== false);
}

// ─── eBay ──────────────────────────────────────────────────────────────────

export type DataCarddassEbayFace = (typeof ebayLedger.faces)[number];

export function dataCarddassEbayListingImageFull(url: string): string {
  return url.replace(/\/s-l\d+\.(webp|jpe?g)$/i, "/s-l1600.$1");
}

export function dataCarddassEbayIngestFaces(): DataCarddassEbayFace[] {
  return ebayLedger.faces.filter((row) => row.ingest);
}

// ─── Mercari ───────────────────────────────────────────────────────────────

export type DataCarddassMercariFace = (typeof mercariLedger.faces)[number];

export function dataCarddassMercariIngestFaces(): DataCarddassMercariFace[] {
  return mercariLedger.faces.filter((row) => {
    if (!row.ingest) return false;
    const hasCurated =
      "curated" in row && typeof (row as { curated?: unknown }).curated === "string";
    const hasUrl = typeof row.url === "string" && row.url.length > 0;
    return hasCurated || hasUrl;
  });
}
