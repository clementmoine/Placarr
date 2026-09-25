/**
 * Parser for Suruga-ya listings for Naruto Shippuden (忍伝, 術伝, 作伝, 忍伝-学).
 *
 * Scans are hosted on Suruga-ya CDN without bot protection:
 *   https://cdn.suruga-ya.jp/database/pics/game/{id.toLowerCase()}.jpg
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { diskIdFromPrintedReference } from "../search";
import { shippudenPrintKey } from "../pipeline/ledgers";

export const SURUGA_SHIPPUDEN_ORIGIN = "https://www.suruga-ya.jp";
export const SURUGA_SHIPPUDEN_CDN = "https://cdn.suruga-ya.jp/database/pics/game";

const LISTINGS_TSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-shippuden-listings.tsv",
);

const ITEM_RE =
  /item_id:\s*(?:common\.htmlDecode\(\s*)?['"]([A-Za-z0-9]+)['"]\s*\)?\s*,\s*item_name:\s*(?:common\.htmlDecode\(\s*)?['"]([^'"]+)['"]/gi;

const DOM_ITEM_RE =
  /<a[^>]*href="[^"]*\/product\/detail\/([A-Za-z0-9]+)[^"]*"[^>]*>[\s\r\n]*<h3 class="product-name">([^<]+)<\/h3>/gi;

const PRINTED_IN_TITLE =
  /(?:^|[^ァ-ヴーa-zA-Z0-9])(PR学\s*-?\s*\d+|PR作伝\s*-?\s*\d+|PR忍伝\s*-?\s*\d+|忍伝-学\s*-?\s*\d+|忍伝\s*-?\s*\d+|術伝\s*-?\s*\d+|作伝\s*-?\s*\d+)(?=[^0-9]|$)/i;

function decodeSurugaHtmlEntities(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function parseSurugaShippudenPrintedFromTitle(title: string): string | null {
  const m = PRINTED_IN_TITLE.exec(title);
  if (!m) return null;
  const raw = m[1]!.replace(/\s+/g, "");
  // Ensure valid format matching diskIdFromPrintedReference
  const diskId = diskIdFromPrintedReference(raw);
  if (!diskId) return null;
  return raw;
}

export function parseCardNameFromSurugaTitle(title: string): string | null {
  const colonIdx = title.indexOf("：");
  let name = colonIdx >= 0 ? title.slice(colonIdx + 1).trim() : title.trim();
  name = name.replace(/^[^\/]+\//, "");
  name = name.replace(/（[A-Za-z]ランク）$/, "");
  return name.trim() || null;
}

export type SurugaShippudenListing = {
  id: string;
  printed: string;
  title?: string;
};

export type SurugaShippudenFamily =
  | "shi"
  | "mju"
  | "msa"
  | "gaku"
  | "prshi"
  | "prmsa"
  | "prgaku";

export type SurugaShippudenCard = {
  family: SurugaShippudenFamily;
  diskId: string;
  printKey: string;
  printed: string;
  title?: string;
  productIds: string[];
  faceUrl: string;
};

export function surugaShippudenFaceUrl(productId: string): string {
  return `${SURUGA_SHIPPUDEN_CDN}/${productId.toLowerCase()}.jpg`;
}

export function surugaShippudenProductUrl(productId: string): string {
  return `${SURUGA_SHIPPUDEN_ORIGIN}/product/detail/${productId}`;
}

function pushListing(
  out: SurugaShippudenListing[],
  seen: Set<string>,
  idRaw: string,
  title: string,
): void {
  const id = idRaw.trim().toUpperCase();
  if (!id || seen.has(id)) return;
  const printed = parseSurugaShippudenPrintedFromTitle(title);
  if (!printed) return;
  seen.add(id);
  out.push({ id, printed, title: title.trim() });
}

export function parseSurugaShippudenHtml(html: string): SurugaShippudenListing[] {
  const out: SurugaShippudenListing[] = [];
  const seen = new Set<string>();

  DOM_ITEM_RE.lastIndex = 0;
  let domMatch: RegExpExecArray | null;
  while ((domMatch = DOM_ITEM_RE.exec(html)) !== null) {
    const [, id, rawTitle] = domMatch;
    pushListing(out, seen, id!, decodeSurugaHtmlEntities(rawTitle!));
  }

  ITEM_RE.lastIndex = 0;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = ITEM_RE.exec(html)) !== null) {
    const [, id, rawTitle] = scriptMatch;
    pushListing(out, seen, id!, decodeSurugaHtmlEntities(rawTitle!));
  }

  return out;
}

export function parseSurugaShippudenListingsTsv(tsvText: string): SurugaShippudenListing[] {
  const out: SurugaShippudenListing[] = [];
  const seen = new Set<string>();
  for (const line of tsvText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [idRaw, printedRaw, ...titleParts] = trimmed.split("\t");
    const id = idRaw?.trim().toUpperCase();
    const printed = printedRaw?.trim();
    if (!id || !printed) continue;
    if (seen.has(id)) continue;
    const diskId = diskIdFromPrintedReference(printed);
    if (!diskId) continue;
    seen.add(id);
    const title = titleParts.join("\t").trim();
    out.push({ id, printed, ...(title ? { title } : {}) });
  }
  return out;
}

export function serializeSurugaShippudenListingsTsv(
  listings: readonly SurugaShippudenListing[],
): string {
  const sorted = [...listings].sort((a, b) => a.id.localeCompare(b.id));
  const lines = sorted.map((row) =>
    row.title ? `${row.id}\t${row.printed}\t${row.title}` : `${row.id}\t${row.printed}`,
  );
  return `${lines.join("\n")}\n`;
}

export function loadSurugaShippudenCuratedListings(tsvPath = LISTINGS_TSV): SurugaShippudenListing[] {
  try {
    return parseSurugaShippudenListingsTsv(readFileSync(tsvPath, "utf8"));
  } catch {
    return [];
  }
}

export function foldSurugaShippudenListings(
  listings: readonly SurugaShippudenListing[],
): SurugaShippudenCard[] {
  const byDiskId = new Map<
    string,
    {
      family: SurugaShippudenFamily;
      diskId: string;
      printKey: string;
      printed: string;
      title?: string;
      productIds: string[];
    }
  >();

  for (const l of listings) {
    const diskId = diskIdFromPrintedReference(l.printed);
    if (!diskId) continue;
    const printKey = shippudenPrintKey(diskId);
    if (!printKey) continue;
    const family = diskId.replace(/\d+$/, "") as SurugaShippudenFamily;

    const existing = byDiskId.get(diskId);
    if (!existing) {
      byDiskId.set(diskId, {
        family,
        diskId,
        printKey,
        printed: l.printed,
        title: l.title,
        productIds: [l.id],
      });
    } else if (!existing.productIds.includes(l.id)) {
      existing.productIds.push(l.id);
      if (!existing.title && l.title) existing.title = l.title;
    }
  }

  return [...byDiskId.values()]
    .map((c) => ({
      family: c.family,
      diskId: c.diskId,
      printKey: c.printKey,
      printed: c.printed,
      title: c.title,
      productIds: c.productIds,
      faceUrl: surugaShippudenFaceUrl(c.productIds[0]!),
    }))
    .sort((a, b) => a.diskId.localeCompare(b.diskId));
}
