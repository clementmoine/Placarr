/**
 * Data Carddass catalogue parsers — official cardlists, eBay paste, nao-yoshi
 * Seesaa, Suruga listings.
 *
 * Merged from: parseOfficialCardlists, parseEbaySearchHtml, parseNaoYoshiSeesaa,
 * parseSurugaDataCarddass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatDataCarddassReference,
  parseDataCarddassPrinted,
} from "../printKey";

// ─── Official cardlists ───────────────────────────────────────────────────

export type OfficialDcdCard = {
  printed: string;
  nameJa: string;
};

const PRINTED_RE =
  /^(NXPF|NX-CAM|NX-MAC|VJCF|NFP|NFM|NFC|NFF|NXP|DNP|DMP|CAN|DN|DT|NM|NC|NF|NX)-?(\d+)(?:-?([A-Za-z]))?$/i;

function toHalfWidth(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** `NF001` / `DN-001T` → `NF-001` / `DN-001T`. */
export function normalizeOfficialPrinted(raw: string): string | null {
  const trimmed = toHalfWidth(raw.trim().replace(/\s+/g, "")).toUpperCase();
  const m = PRINTED_RE.exec(trimmed);
  if (!m) return null;
  return `${m[1]!.toUpperCase()}-${m[2]!}${m[3] ? m[3].toUpperCase() : ""}`;
}

export function decodeOfficialCardlistBytes(raw: Buffer | Uint8Array): string {
  return new TextDecoder("shift_jis").decode(raw);
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function dedupe(cards: OfficialDcdCard[]): OfficialDcdCard[] {
  const out = new Map<string, OfficialDcdCard>();
  for (const card of cards) {
    if (!card.printed || !card.nameJa) continue;
    if (!out.has(card.printed)) out.set(card.printed, card);
  }
  return [...out.values()];
}

/**
 * CSV officiel `battle_card.csv` (DN / DNP).
 * Colonnes : 収録, カードNo, カード名, …
 */
export function parseBattleCardCsv(csvText: string): OfficialDcdCard[] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  const cards: OfficialDcdCard[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    if (cols.length < 3) continue;
    const printed = normalizeOfficialPrinted(cols[1] ?? "");
    const nameJa = (cols[2] ?? "").trim();
    if (!printed || !nameJa) continue;
    if (!/^(DN|DNP)-/.test(printed)) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Pages Mission (`cardlist*.shtml`, promocard, tokunin, clear) :
 * `>NM-001</td>…<a>うずまきナルト</a>`.
 */
export function parseMissionCardlistHtml(
  html: string,
  prefixes: ReadonlySet<string> = new Set(["NM", "NC", "DMP", "DNP", "DN"]),
): OfficialDcdCard[] {
  const cards: OfficialDcdCard[] = [];
  const re =
    />\s*((?:NM|NC|DMP|DNP|DN)[-]?\d+[A-Za-z]?)\s*<\/td>[\s\S]{0,900}?<a[^>]*>\s*([^<]+)\s*(?:<br[^>]*>)?/gi;
  for (const match of html.matchAll(re)) {
    const printed = normalizeOfficialPrinted(match[1]!);
    if (!printed) continue;
    const pref = printed.split("-")[0]!;
    if (!prefixes.has(pref)) continue;
    const nameJa = unescapeHtml(match[2]!);
    if (!nameJa || /カード/.test(nameJa)) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}

/**
 * Pages Formation fudanin (`1st.php`…`7th.php`, clear, advance) :
 * `>NF001</td>…<a>うずまきナルト<br>(疾風伝)</a>`.
 */
export function parseFormationCardlistHtml(html: string): OfficialDcdCard[] {
  const cards: OfficialDcdCard[] = [];
  const re =
    />\s*((?:NF|NFP|NFM|NFC|DMP)[-]?\d+)\s*<\/td>[\s\S]{0,600}?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const printed = normalizeOfficialPrinted(match[1]!);
    if (!printed) continue;
    let nameJa = unescapeHtml(match[2]!.replace(/<[^>]+>/g, " "));
    nameJa = nameJa.replace(/\s+/g, " ").replace(/\([^)]*\)\s*$/u, "").trim();
    if (!nameJa) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}

/**
 * Page Cross fudanin (`index.php?category=…`) :
 * `>NX-001</td>…<a>うずまきナルト</a>` / `NXP-` / `NXpf-`.
 */
export function parseCrossCardlistHtml(html: string): OfficialDcdCard[] {
  const cards: OfficialDcdCard[] = [];
  const re =
    />\s*((?:NXPF|NXpf|NXP|NX)[-]?\d+[A-Za-z]?)\s*<\/td>[\s\S]{0,600}?<a[^>]*>\s*([^<]+)(?:<br[^>]*>[^<]*)?\s*<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const printed = normalizeOfficialPrinted(match[1]!);
    if (!printed) continue;
    const nameJa = unescapeHtml(match[2]!);
    if (!nameJa) continue;
    cards.push({ printed, nameJa });
  }
  return dedupe(cards);
}


// ─── eBay search HTML paste ───────────────────────────────────────────────

const EBAY_PRINTED_RE =
  /\b((?:NFP|NFM|NFC|NXPF|NXP|DNP|DMP|DN|DT|NM|NC|NF|NX)[- ]?\d+[A-Za-z]?)/i;
const ITM_RE = /\/itm\/(\d+)/i;
const IMG_RE = /i\.ebayimg\.com\/images\/g\/([^/"'\s]+)\/s-l\d+/i;

export type EbayPasteFace = {
  printedRef: string;
  lang: "ja";
  title: string;
  listing: string;
  imageId: string;
  url: string;
  staging: string;
  ingest: true;
};

function normalizePrinted(raw: string): string | null {
  const parsed = parseDataCarddassPrinted(raw.replace(/\s+/g, ""));
  if (!parsed) return null;
  // Skip roman SP promos (NXP-SP…) — ambiguous / non-numeric.
  if (!/^\d/.test(parsed.number)) return null;
  return formatDataCarddassReference(parsed.set, parsed.number);
}

/**
 * Best-effort: scan HTML for /itm/N + nearby title + ebayimg g/{id}.
 * Dedupes by printedRef (first wins).
 */
export function parseEbayDataCarddassSearchHtml(
  html: string,
): EbayPasteFace[] {
  const faces: EbayPasteFace[] = [];
  const seenPrinted = new Set<string>();
  const seenListing = new Set<string>();

  // Split roughly on listing anchors.
  const chunks = html.split(/href="https?:\/\/www\.ebay\.[^"]*\/itm\//i);
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i]!;
    const idMatch = /^(\d+)/.exec(chunk);
    if (!idMatch) continue;
    const listingId = idMatch[1]!;
    if (seenListing.has(listingId)) continue;
    seenListing.add(listingId);

    const window = chunk.slice(0, 4000);
    const printedMatch = EBAY_PRINTED_RE.exec(window);
    if (!printedMatch) continue;
    const printedRef = normalizePrinted(printedMatch[1]!);
    if (!printedRef) continue;
    const key = printedRef.toUpperCase();
    if (seenPrinted.has(key)) continue;

    const imgMatch = IMG_RE.exec(window);
    if (!imgMatch) continue;
    const imageId = imgMatch[1]!;

    // Title: first substantial text-ish blob after the id.
    const titleRaw =
      (window.match(/aria-label="([^"]{8,180})"/i) || [])[1] ||
      (window.match(/>([^<]{8,180})</) || [])[1] ||
      printedRef;
    const title = titleRaw
      .replace(/\s+/g, " ")
      .replace(/La page s'ouvre.*/i, "")
      .trim()
      .slice(0, 120);

    const slug = printedRef.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    seenPrinted.add(key);
    faces.push({
      printedRef: key,
      lang: "ja",
      title,
      listing: `https://www.ebay.fr/itm/${listingId}`,
      imageId,
      url: `https://i.ebayimg.com/images/g/${imageId}/s-l1600.webp`,
      staging: `staging/ebay/${slug}-ja.webp`,
      ingest: true,
    });
  }

  // Also catch JSON-ish / loose pairs when chunk split fails.
  if (faces.length === 0) {
    ITM_RE.lastIndex = 0;
    // no-op fallback kept for API stability
  }

  faces.sort((a, b) => a.printedRef.localeCompare(b.printedRef));
  return faces;
}


// ─── nao-yoshi Seesaa ─────────────────────────────────────────────────────

export const NAO_YOSHI_SEESAA_ORIGIN = "https://nao-yoshi.seesaa.net";

export const NAO_YOSHI_SEESAA_ARTICLES: ReadonlyArray<{
  id: string;
  cabinet: "dn" | "nm" | "nf" | "nx";
  label: string;
  path: string;
}> = [
  {
    id: "387082531",
    cabinet: "dn",
    label: "Card Battle DN-001–107 + DNP",
    path: "/article/387082531.html",
  },
  {
    id: "387082805",
    cabinet: "dn",
    label: "Card Battle DN-108–250",
    path: "/article/387082805.html",
  },
  {
    id: "387083049",
    cabinet: "nm",
    label: "Mission NM + DMP",
    path: "/article/387083049.html",
  },
  {
    id: "387083386",
    cabinet: "nf",
    label: "Formation NF + NFP",
    path: "/article/387083386.html",
  },
  {
    id: "387083772",
    cabinet: "nx",
    label: "Cross NX + NXP / NX-MAC",
    path: "/article/387083772.html",
  },
];

/** Printed refs like DN-001T, NX-MAC001, NXP-002 — not raw CODE128 payloads. */
export const NAO_YOSHI_PRINTED_RE =
  /^(?:DN|DT|DNP|DMP|NM|NC|NF|NFC|NFM|NFP|NX|NXP|NXPF)-(?:\d{1,3}[A-Z]*|MAC\d{1,3}|CAM\d{1,3})$/i;

export type NaoYoshiSeesaaRow = {
  printed: string;
  nameJa: string;
  rarity: string | null;
  barcodeData: string | null;
  cabinet: "dn" | "nm" | "nf" | "nx";
  articleId: string;
};

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlBytes(raw: Buffer | string): string {
  if (typeof raw === "string") return raw;
  // Seesaa articles are Shift_JIS / cp932.
  try {
    return new TextDecoder("shift_jis").decode(raw);
  } catch {
    return raw.toString("utf8");
  }
}

/**
 * Map blog rarity glyphs to catalogue labels.
 * Fullwidth Ｎ/Ｒ and abbreviations 激/爆 expand to collector-facing forms.
 */
export function normalizeNaoYoshiRarity(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t || t === "-" || t === "－" || t === "—") return null;
  const compact = t.replace(/\s+/g, "");
  const map: Record<string, string> = {
    Ｎ: "N",
    N: "N",
    Ｒ: "R",
    R: "R",
    SR: "SR",
    NR: "NR",
    UR: "UR",
    WNR: "WNR",
    JR: "JR",
    BR: "BR",
    SC: "SC",
    激: "激レア",
    激レア: "激レア",
    爆: "爆レア",
    爆レア: "爆レア",
    呪印: "呪印",
    暁: "暁",
    絆: "絆",
  };
  if (map[compact]) return map[compact];
  // Ignore parser noise / barcode leftovers.
  if (
    /^(A|start|stop|データ|CheckDigit)$/i.test(compact) ||
    (compact.length >= 6 && /^[A-Z0-9;()]+$/i.test(compact))
  ) {
    return null;
  }
  return compact;
}

function extractPrintedRefs(cell: string): string[] {
  const parts = cell
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  if (!parts.every((p) => NAO_YOSHI_PRINTED_RE.test(p))) return [];
  return parts.map((p) => p.toUpperCase());
}

/**
 * Parse one article HTML (already decoded as Unicode text).
 */
export function parseNaoYoshiSeesaaArticle(
  html: string,
  meta: { articleId: string; cabinet: NaoYoshiSeesaaRow["cabinet"] },
): NaoYoshiSeesaaRow[] {
  const rows: NaoYoshiSeesaaRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(trRe)) {
    const rowHtml = match[1]!;
    const cells = Array.from(
      rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
    )
      .map((m) => stripTags(m[1]!))
      .filter((c) => c && c !== "&nbsp;");
    if (!cells.length) continue;

    let refIdx = -1;
    let refs: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const found = extractPrintedRefs(cells[i]!);
      if (found.length) {
        refIdx = i;
        refs = found;
        break;
      }
    }
    if (refIdx < 0) continue;

    const rest = cells.slice(refIdx + 1);
    const nameJa = rest[0]?.trim() ?? "";
    if (!nameJa || nameJa === "カード名" || nameJa.startsWith("【")) continue;

    const rarityRaw = rest[1] ?? null;
    let barcodeData: string | null = null;
    if (rest.length > 3 && (rest[2] === "A" || rest[2] === "start" || rest[2] === "-")) {
      barcodeData = rest[3] && rest[3] !== "-" ? rest[3] : null;
    } else if (rest.length > 2 && rest[2] && !["A", "start", "-"].includes(rest[2])) {
      barcodeData = rest[2];
    }

    const rarity = normalizeNaoYoshiRarity(rarityRaw);
    for (const printed of refs) {
      rows.push({
        printed,
        nameJa,
        rarity,
        barcodeData,
        cabinet: meta.cabinet,
        articleId: meta.articleId,
      });
    }
  }
  return rows;
}

export function parseNaoYoshiSeesaaBytes(
  raw: Buffer,
  meta: { articleId: string; cabinet: NaoYoshiSeesaaRow["cabinet"] },
): NaoYoshiSeesaaRow[] {
  return parseNaoYoshiSeesaaArticle(decodeHtmlBytes(raw), meta);
}

export function mergeNaoYoshiSeesaaRows(
  rows: readonly NaoYoshiSeesaaRow[],
): Map<string, NaoYoshiSeesaaRow> {
  const out = new Map<string, NaoYoshiSeesaaRow>();
  for (const row of rows) {
    const key = row.printed.toUpperCase();
    const prev = out.get(key);
    if (!prev) {
      out.set(key, row);
      continue;
    }
    // Prefer a named row with rarity over a sparse one.
    const score = (r: NaoYoshiSeesaaRow) =>
      (r.nameJa ? 2 : 0) + (r.rarity ? 1 : 0) + (r.barcodeData ? 1 : 0);
    if (score(row) >= score(prev)) out.set(key, row);
  }
  return out;
}

/** True when a checklist Japanese title looks like mojibake / replacement chars. */
export function looksLikeMojibakeJa(name: string | null | undefined): boolean {
  if (!name) return false;
  if (name.includes("�")) return true;
  // Typical Shift_JIS→UTF-8 corruption from Wayback fudanin pages.
  return /[縺繧]/.test(name);
}


// ─── Suruga Data Carddass listings ────────────────────────────────────────

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
  /(?:[\b\s]|^)((?:NFP|NFM|NFC|NFF|NXPF|NX-CAM|NXCAM|NX-MAC|VJCF|NXP|DNP|DMP|CAN|DN|DT|NM|NC|NF|NX|ＮＦM|ＮＦF|ＮＦP|ＮＦ|ＮＭ|ＤＮ)\s*-?\s*\d+\s*[A-Za-z]?)(?:[\b\s：:\[\]]|$)/i;

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

function toHalfWidthSuruga(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function parseSurugaDataCarddassPrintedFromTitle(
  title: string,
): string | null {
  const normalized = toHalfWidthSuruga(title);
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
