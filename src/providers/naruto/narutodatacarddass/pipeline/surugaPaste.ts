/**
 * Merge Suruga category HTML (Cloudflare-paste / Wayback) into the DCD TSV.
 *
 * Category pages are not crawlable; CDN JPEGs are. Paste HTML → append TSV →
 * `installSurugaFaces` downloads.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatSurugaDataCarddassListingsTsv,
  mergeSurugaDataCarddassListings,
  parseSurugaDataCarddassCategoryHtml,
  parseSurugaDataCarddassListingsTsv,
} from "../parse/catalogues";

const LISTINGS_TSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-data-carddass-listings.tsv",
);

export function mergeSurugaHtmlIntoListingsTsv(
  html: string,
  tsvPath = LISTINGS_TSV,
): { before: number; after: number; added: number; path: string } {
  const fromHtml = parseSurugaDataCarddassCategoryHtml(html);
  const existing = parseSurugaDataCarddassListingsTsv(
    readFileSync(tsvPath, "utf8"),
  );
  const before = existing.length;
  const merged = mergeSurugaDataCarddassListings(existing, fromHtml);
  writeFileSync(tsvPath, formatSurugaDataCarddassListingsTsv(merged), "utf8");
  return {
    before,
    after: merged.length,
    added: merged.length - before,
    path: tsvPath,
  };
}

/** Read a pasted HTML file and merge into the curated TSV. */
export function mergeSurugaHtmlFileIntoListingsTsv(
  htmlPath: string,
  tsvPath = LISTINGS_TSV,
): { before: number; after: number; added: number; path: string } {
  return mergeSurugaHtmlIntoListingsTsv(
    readFileSync(htmlPath, "utf8"),
    tsvPath,
  );
}
