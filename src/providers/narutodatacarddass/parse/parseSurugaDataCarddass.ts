/**
 * Suruga-ya used listings for Naruto Data Carddass (DN/NM/NF/NX…).
 *
 * Same contract as Carddass tabletop Suruga: category HTML is Cloudflare /
 * paste-or-Wayback; CDN JPEGs are not:
 *   https://cdn.suruga-ya.jp/database/pics/game/{id.lower()}.jpg
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeOfficialPrinted,
} from "./parseOfficialCardlists";
import { parseDataCarddassPrinted } from "../printKey";

export const SURUGA_DCD_ORIGIN = "https://www.suruga-ya.com";
export const SURUGA_DCD_CDN = "https://cdn.suruga-ya.jp/database/pics/game";
export const SURUGA_DCD_LANG = "ja";
export const SURUGA_DCD_CATEGORY =
  "https://www.suruga-ya.com/en/category/501080113";

const LISTINGS_TSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-data-carddass-listings.tsv",
);

const ITEM_RE =
  /item_id:\s*(?:common\.htmlDecode\(\s*)?['"]([A-Za-z0-9]+)['"]\s*\)?\s*,\s*item_name:\s*(?:common\.htmlDecode\(\s*)?['"]([^'"]+)['"]/gi;

/** Legacy EN category tiles: `data-info="{&quot;id&quot;:&quot;G…&quot;,&quot;name&quot;:&quot;NM - 031: …&quot;…}"`. */
const DATA_INFO_RE = /data-info="(\{[^"]+\})"/gi;

/** Modern DOM tiles on suruga-ya.jp: `<h3 class="product-name">...</h3>` */
const DOM_ITEM_RE =
  /<div class="item_detail">[\s\S]*?<a[^>]*href="[^"]*\/product\/detail\/([A-Za-z0-9]+)[^"]*"[^>]*>[\s\S]*?<h3 class="product-name">([^<]+)<\/h3>/gi;

/** Boutique titles may space the hyphen (`NM - 031`, `DN - 035 T`). Handles fullwidth letters. */
const PRINTED_IN_TITLE =
  /(?:[\b\s]|^)((?:NFP|NFM|NFC|NFF|NXPF|NX-CAM|NXCAM|NX-MAC|NXP|DNP|DMP|CAN|DN|DT|NM|NC|NF|NX|ＮＦM|ＮＦF|ＮＦP|ＮＦ|ＮＭ|ＤＮ)\s*-?\s*\d+\s*[A-Za-z]?)(?:[\b\s：:\[\]]|$)/i;

const SP_IN_TITLE =
  /\b((?:NXP|NX)-?\s*SP-?\s*(?:III|II|I)|NFM-?\s*SP)\b/i;

function decodeSurugaHtmlEntities(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function pushListing(
  out: SurugaDataCarddassListing[],
  seen: Set<string>,
  idRaw: string,
  title: string,
): void {
  const id = idRaw.trim().toUpperCase();
  if (!id || seen.has(id)) return;
  const printed = parseSurugaDataCarddassPrintedFromTitle(title);
  if (!printed || !parseDataCarddassPrinted(printed)) return;
  seen.add(id);
  out.push({ id, printed, title: title.trim() });
}

export type SurugaDataCarddassListing = {
  id: string;
  printed: string;
  title?: string;
};

export type SurugaDataCarddassCard = {
  set: string;
  number: string;
  printed: string;
  productIds: string[];
  faceUrl: string;
};

export function surugaDataCarddassFaceUrl(productId: string): string {
  return `${SURUGA_DCD_CDN}/${productId.toLowerCase()}.jpg`;
}

export function surugaDataCarddassProductUrl(productId: string): string {
  return `${SURUGA_DCD_ORIGIN}/en/product/detail/${productId}`;
}

function toHalfWidth(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function parseSurugaDataCarddassPrintedFromTitle(
  title: string,
): string | null {
  const normalized = toHalfWidth(title);
  const sp = SP_IN_TITLE.exec(normalized);
  if (sp) {
    const parsed = parseDataCarddassPrinted(sp[1]!.replace(/\s+/g, ""));
    if (parsed) return parsed.printed;
  }
  const m = PRINTED_IN_TITLE.exec(normalized);
  if (!m) return null;
  const viaOfficial = normalizeOfficialPrinted(m[1]!);
  if (viaOfficial) {
    const parsed = parseDataCarddassPrinted(viaOfficial);
    return parsed?.printed ?? viaOfficial;
  }
  const parsed = parseDataCarddassPrinted(m[1]!.replace(/\s+/g, ""));
  return parsed?.printed ?? null;
}

/**
 * EN category pages: GA4 `items.push({ item_id, item_name })` (2024+) and/or
 * legacy `data-info` JSON on product tiles (≈2019).
 */
export function parseSurugaDataCarddassCategoryHtml(
  html: string,
): SurugaDataCarddassListing[] {
  const seen = new Set<string>();
  const out: SurugaDataCarddassListing[] = [];
  DOM_ITEM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DOM_ITEM_RE.exec(html))) {
    pushListing(out, seen, match[1]!, match[2]!);
  }
  ITEM_RE.lastIndex = 0;
  while ((match = ITEM_RE.exec(html))) {
    pushListing(out, seen, match[1]!, match[2]!);
  }
  DATA_INFO_RE.lastIndex = 0;
  while ((match = DATA_INFO_RE.exec(html))) {
    let payload: { id?: string; name?: string };
    try {
      payload = JSON.parse(decodeSurugaHtmlEntities(match[1]!)) as {
        id?: string;
        name?: string;
      };
    } catch {
      continue;
    }
    if (!payload.id || !payload.name) continue;
    pushListing(out, seen, payload.id, payload.name);
  }
  return out;
}

export function parseSurugaDataCarddassListingsTsv(
  tsv: string,
): SurugaDataCarddassListing[] {
  const out: SurugaDataCarddassListing[] = [];
  const seen = new Set<string>();
  for (const line of tsv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const tab = trimmed.indexOf("\t");
    if (tab < 0) continue;
    const id = trimmed.slice(0, tab).trim().toUpperCase();
    const rest = trimmed.slice(tab + 1).trim();
    const rawPrinted = rest.split("\t")[0] ?? "";
    const printed =
      parseDataCarddassPrinted(rawPrinted)?.printed ??
      normalizeOfficialPrinted(rawPrinted) ??
      parseSurugaDataCarddassPrintedFromTitle(rest);
    if (!id || !printed || !parseDataCarddassPrinted(printed) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, printed });
  }
  return out;
}

export function loadSurugaDataCarddassCuratedListings(): SurugaDataCarddassListing[] {
  return parseSurugaDataCarddassListingsTsv(readFileSync(LISTINGS_TSV, "utf8"));
}

export function mergeSurugaDataCarddassListings(
  ...groups: readonly (readonly SurugaDataCarddassListing[])[]
): SurugaDataCarddassListing[] {
  const seen = new Set<string>();
  const out: SurugaDataCarddassListing[] = [];
  for (const group of groups) {
    for (const row of group) {
      const id = row.id.toUpperCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ ...row, id });
    }
  }
  return out;
}

export function foldSurugaDataCarddassListings(
  listings: readonly SurugaDataCarddassListing[],
): SurugaDataCarddassCard[] {
  const byKey = new Map<string, SurugaDataCarddassCard>();
  for (const row of listings) {
    const parsed = parseDataCarddassPrinted(row.printed);
    if (!parsed) continue;
    const key = `${parsed.set}:${parsed.number}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        set: parsed.set,
        number: parsed.number,
        printed: parsed.printed,
        productIds: [row.id],
        faceUrl: surugaDataCarddassFaceUrl(row.id),
      });
      continue;
    }
    if (!prev.productIds.includes(row.id)) prev.productIds.push(row.id);
  }
  return [...byKey.values()].sort((a, b) =>
    a.printed.localeCompare(b.printed, "en"),
  );
}

export function formatSurugaDataCarddassListingsTsv(
  listings: readonly SurugaDataCarddassListing[],
): string {
  const lines = ["# productId\tprinted", ...listings.map((row) => `${row.id}\t${row.printed}`)];
  return `${lines.join("\n")}\n`;
}
