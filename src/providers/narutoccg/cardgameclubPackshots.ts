/**
 * CardGameClub CACG IT sealed packshots.
 * Source of truth: `curated/sources/cardgameclub.json`.
 *
 * Product pages only (user paste). The collection is not a scrape target.
 */
import ledger from "./curated/sources/cardgameclub.json";

export type CardgameclubPackshot = (typeof ledger.products)[number];

export function cardgameclubLedger() {
  return ledger;
}

export function cardgameclubIngestPackshots(): CardgameclubPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}

/** Shopify file URLs keep `?v=`; the path without query is the bytes. */
export function cardgameclubImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url.split("?")[0] ?? url;
  }
}
