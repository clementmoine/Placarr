/**
 * Suruga-ya used listings for JP Carddass tabletop (巻ノ… 忍/術/作/依).
 *
 * Search HTML is behind Cloudflare; CDN JPEGs are not:
 *   https://cdn.suruga-ya.jp/database/pics/game/{id.lower()}.jpg
 * Never Data Carddass DN/NM. Never EN CCG n/j.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { narutoDiskCardId } from "../collectorIdentity";

export const SURUGA_CARDDASS_ORIGIN = "https://www.suruga-ya.jp";
export const SURUGA_CARDDASS_CDN =
  "https://cdn.suruga-ya.jp/database/pics/game";
export const SURUGA_CARDDASS_LANG = "ja";
export const SURUGA_CARDDASS_SEARCH =
  "https://www.suruga-ya.jp/search?category=5&search_word=NARUTO-%E3%83%8A%E3%83%AB%E3%83%88-%20%E3%82%AB%E3%83%BC%E3%83%89%E3%82%B2%E3%83%BC%E3%83%A0%20%E5%B7%BB%E3%83%8E";

const LISTINGS_TSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-carddass-listings.tsv",
);

const PRODUCT_HREF =
  /href="https:\/\/www\.suruga-ya\.jp\/product\/detail\/([A-Za-z0-9]+)"/gi;

const PRINTED_RE =
  /(PR[-]?忍|PR[-]?術|PR[-]?作|PR[-]?依|OP忍|[忍術作依])-(\d{1,4})(?:-([A-Za-z0-9]+))?/;

const DATA_CARDDASS_RE = /データカードダス|\bDN-|\bNM-/i;

export type SurugaCarddassListing = {
  id: string;
  printed: string;
};

export type SurugaCarddassCard = {
  number: string;
  printed: string;
  productIds: string[];
  faceUrl: string;
};

export function surugaCarddassFaceUrl(productId: string): string {
  return `${SURUGA_CARDDASS_CDN}/${productId.toLowerCase()}.jpg`;
}

export function surugaCarddassProductUrl(productId: string): string {
  return `${SURUGA_CARDDASS_ORIGIN}/product/detail/${productId}`;
}

export function parseSurugaCarddassPrinted(raw: string): string | null {
  const m = PRINTED_RE.exec(raw.replace(/\s+/g, ""));
  if (!m) return null;
  return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
}

/** `忍-85` → `ni0085`. Null for Data Carddass / unrecognised. */
export function surugaPrintedToDiskId(printed: string): string | null {
  const folded = parseSurugaCarddassPrinted(printed) ?? printed.trim();
  return narutoDiskCardId(folded);
}

export function parseSurugaCarddassSearchHtml(
  html: string,
): SurugaCarddassListing[] {
  const seen = new Set<string>();
  const out: SurugaCarddassListing[] = [];
  PRODUCT_HREF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_HREF.exec(html))) {
    const id = m[1]!.toUpperCase();
    if (seen.has(id)) continue;
    const slice = html.slice(m.index, m.index + 2500);
    const printed = parseSurugaCarddassPrinted(slice);
    if (isDataCarddassSlice(slice, printed) || !printed) continue;
    seen.add(id);
    out.push({ id, printed });
  }
  return out;
}

function isDataCarddassSlice(slice: string, printed: string | null): boolean {
  if (!DATA_CARDDASS_RE.test(slice)) return false;
  return !printed;
}

/** Single product page — same printed rules as search slices. */
export function parseSurugaProductDetailHtml(
  html: string,
  productId: string,
): SurugaCarddassListing | null {
  const printed = parseSurugaCarddassPrinted(html);
  if (!printed) return null;
  if (isDataCarddassSlice(html, printed)) return null;
  if (/^NM-|^DN-/i.test(printed)) return null;
  return { id: productId.toUpperCase(), printed };
}

export function mergeSurugaCarddassListings(
  ...groups: readonly (readonly SurugaCarddassListing[])[]
): SurugaCarddassListing[] {
  const seen = new Set<string>();
  const out: SurugaCarddassListing[] = [];
  for (const group of groups) {
    for (const row of group) {
      const id = row.id.toUpperCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, printed: row.printed });
    }
  }
  return out;
}

export function parseSurugaCarddassListingsTsv(
  tsv: string,
): SurugaCarddassListing[] {
  const out: SurugaCarddassListing[] = [];
  const seen = new Set<string>();
  for (const line of tsv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const tab = trimmed.indexOf("\t");
    if (tab < 0) continue;
    const id = trimmed.slice(0, tab).trim().toUpperCase();
    const printed = parseSurugaCarddassPrinted(trimmed.slice(tab + 1));
    if (!id || !printed || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, printed });
  }
  return out;
}

export function loadSurugaCarddassCuratedListings(): SurugaCarddassListing[] {
  return parseSurugaCarddassListingsTsv(readFileSync(LISTINGS_TSV, "utf8"));
}

export function foldSurugaCarddassListings(
  listings: readonly SurugaCarddassListing[],
): SurugaCarddassCard[] {
  const byNumber = new Map<string, SurugaCarddassCard>();
  for (const row of listings) {
    const number = surugaPrintedToDiskId(row.printed);
    if (!number) continue;
    const prev = byNumber.get(number);
    if (!prev) {
      byNumber.set(number, {
        number,
        printed: row.printed,
        productIds: [row.id],
        faceUrl: surugaCarddassFaceUrl(row.id),
      });
      continue;
    }
    if (!prev.productIds.includes(row.id)) prev.productIds.push(row.id);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}
