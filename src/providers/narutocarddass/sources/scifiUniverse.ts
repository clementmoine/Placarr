/**
 * SciFi-Universe FR JCC packshots. Source of truth:
 * `curated/sources/scifi-universe.json`.
 *
 * ~200px edition images — last-resort when Tric Trac / Via / eBay /
 * Manga-News are missing. Combined S3/S4 shots and the generic S1
 * vignette stay out.
 */
import ledger from "../curated/sources/scifi-universe.json";

export type ScifiUniverseProduct = (typeof ledger.products)[number];

export type ScifiUniversePackshot = ScifiUniverseProduct & {
  ingest: true;
  staging: string;
};

export function scifiUniverseLedger() {
  return ledger;
}

export function scifiUniverseIngestPackshots(): ScifiUniversePackshot[] {
  return ledger.products.filter(
    (row): row is ScifiUniversePackshot =>
      row.ingest === true &&
      "staging" in row &&
      typeof row.staging === "string",
  );
}
