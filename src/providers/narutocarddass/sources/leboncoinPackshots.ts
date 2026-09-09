/**
 * Leboncoin pasted product packshots (art / back).
 * Source of truth: `curated/sources/leboncoin.json` products[].
 *
 * CDN URLs only — do not crawl listings or seller stores.
 */
import ledger from "../curated/sources/leboncoin.json";

export type LeboncoinPackshot = (typeof ledger.products)[number];

export function leboncoinPackshotLedger() {
  return ledger;
}

export function leboncoinIngestPackshots(): LeboncoinPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "art");
}

export function leboncoinIngestBacks(): LeboncoinPackshot[] {
  return ledger.products.filter((row) => row.ingest && row.role === "back");
}

/** Prefer classified 1200×800 for tin / packaging (ad-large is smaller). */
export function leboncoinPackshotImageFull(url: string): string {
  if (/[?&]rule=/.test(url)) {
    return url.replace(/([?&]rule=)[^&]+/, "$1classified-1200x800-jpg");
  }
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}rule=classified-1200x800-jpg`;
}
