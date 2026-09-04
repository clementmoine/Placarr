/**
 * Rakuten FR pasted CDN assets.
 * Source of truth: `curated/sources/rakuten.json`.
 *
 * Product pages / picture CDN often 403 without a browser session — paste only.
 * Faces are recoverable via `installRakutenFaces` (ledger URLs → `art.rakuten.*`).
 * Packshots stay under `products[]` (tin-box archival).
 */
import ledger from "../curated/sources/rakuten.json";

export type RakutenPackshot = (typeof ledger.products)[number];
export type RakutenFace = (typeof ledger.faces)[number];

export function rakutenPackshotLedger() {
  return ledger;
}

export function rakutenFaceLedger() {
  return ledger;
}

export function rakutenIngestPackshots(): RakutenPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "art");
}

export function rakutenIngestFaces(): RakutenFace[] {
  return (ledger.faces ?? []).filter((row) => row.ingest);
}
