/**
 * Tric Trac public galleries. Source of truth: `curated/sources/trictrac.json`.
 *
 * Next.js serves `_next/image?w=96`. Catalogue wants the cdn10 original.
 */
import ledger from "./curated/sources/trictrac.json";

export type TrictracPackshot = (typeof ledger.products)[number];

export function trictracCdnOriginal(url: string): string {
  try {
    const parsed = new URL(url, "https://trictrac.net");
    if (parsed.pathname === "/_next/image") {
      const inner = parsed.searchParams.get("url");
      if (inner) return inner;
    }
  } catch {
    /* keep */
  }
  return url;
}

export function trictracLedger() {
  return ledger;
}

export function trictracIngestPackshots(): TrictracPackshot[] {
  return ledger.products.filter((row) => row.ingest);
}
