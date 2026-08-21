/**
 * Graded Card Center JP Carddass packshots.
 * Source of truth: `curated/sources/gradedcardcenter.json`.
 *
 * One pasted item. The collection / other auctions are not scrape targets.
 * Cloudflare `/cdn-cgi/image/…/` is a resize; the bytes we keep are the
 * untransformed `item_recto_` / `item_verso_` JPEG.
 */
import ledger from "./curated/sources/gradedcardcenter.json";

export type GradedcardcenterPackshot = (typeof ledger.products)[number];

export function gradedcardcenterLedger() {
  return ledger;
}

export function gradedcardcenterIngestPackshots(): GradedcardcenterPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}

/** Drop Cloudflare image transforms; keep the original JPEG object. */
export function gradedcardcenterOriginalUrl(url: string): string {
  return url.replace(/\/cdn-cgi\/image\/[^/]+\//, "/");
}
