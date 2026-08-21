/**
 * Yahoo! Auctions JP pasted listing photos.
 * Source of truth: `curated/sources/yahoo-auctions.json`.
 * Bytes are git-backed under `curated/cards/…/ja/source.jpg` — do not crawl.
 */
import ledger from "./curated/sources/yahoo-auctions.json";

export type YahooAuctionFace = (typeof ledger.faces)[number];
export type YahooIngestFace = YahooAuctionFace & { curated: string };

export function yahooAuctionLedger() {
  return ledger;
}

export function yahooIngestFaces(): YahooIngestFace[] {
  return ledger.faces.filter(
    (row): row is YahooIngestFace =>
      row.ingest === true &&
      "curated" in row &&
      typeof row.curated === "string",
  );
}
