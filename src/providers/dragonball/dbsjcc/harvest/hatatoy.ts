/**
 * Harvest JA Dragon Ball Card Game singles from Hatatoy (shop-pro.jp / ColorMe)
 * → curated ledger (`sources/hatatoy.json`).
 *
 * Category: バンダイ ドラゴンボール (cbid=2849233&csid=31) — ~878 products /
 * 12 per page / 74 pages. HTML is EUC-JP. Ignore the site-wide sidebar;
 * only parse `table.list` after `category_title` / `pagenavi`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import https from "node:https";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { dbsJccCuratedDir } from "../pack";
import { parseDbsjccNumber } from "../printKey";
import {
  matchChitoroshopToDbsjccPrint,
  type ChitoroshopMatchResult,
  type DbsjccPrintCandidate,
} from "./chitoroshop";

export const HATATOY_ORIGIN = "https://hatatoy.shop";
/** ColorMe CDN for this shop (PA01424/345). */
export const HATATOY_IMAGE_ORIGIN =
  "https://img07.shop-pro.jp/PA01424/345";
export const HATATOY_CATEGORY = {
  cbid: 2849233,
  csid: 31,
  pages: 74,
} as const;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Printed ref in listing title (`D-920`, `D026`, `SP-52`). */
const PRINTED_RE = /\b((?:SP|D)\s*[-_]?\s*\d+)\b/i;

const NAME_ROW_RE =
  /<div class="name"><a href="\?pid=(\d+)">([^<]+)<\/a><\/div>/gi;

const THUMB_IN_ROW_RE =
  /<img src="(https:\/\/img\d+\.shop-pro\.jp\/[^"]+)"/i;

export type HatatoyFaceRow = {
  printed: string;
  number: string;
  /** `partN` / `sp` when attested (DB volume or SP prefix); else null. */
  setHint: string | null;
  pid: string;
  productUrl: string;
  url: string;
  title: string;
  /** Japanese card name with brand / DB / number / rarity stripped. */
  titleJa: string | null;
  ingest: boolean;
};

export type HatatoyLedger = {
  source: string;
  observed: string;
  ingest: string;
  crawl: boolean;
  note: string;
  listed: number;
  faces: HatatoyFaceRow[];
};

export type HatatoyMatchResult = ChitoroshopMatchResult;

/** Decode the EUC-JP body ColorMe serves. */
export function decodeHatatoyHtml(bytes: Uint8Array): string {
  return new TextDecoder("euc-jp").decode(bytes);
}

function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i >= 0 ? url.slice(0, i) : url;
}

/** Prefer full-size CDN image over `_th` thumbnail. */
export function preferHatatoyFullImage(src: string): string {
  const bare = stripQuery(src.trim());
  return bare.replace(/_th\.(jpe?g|png|webp)$/i, ".$1");
}

export function hatatoyFullImageUrl(pid: string): string {
  return `${HATATOY_IMAGE_ORIGIN}/product/${pid}.jpg`;
}

export function hatatoyProductUrl(pid: string): string {
  return `${HATATOY_ORIGIN}/?pid=${pid}`;
}

export function hatatoyListingUrl(page = 1): string {
  const { cbid, csid } = HATATOY_CATEGORY;
  return `${HATATOY_ORIGIN}/?mode=cate&cbid=${cbid}&csid=${csid}&page=${page}`;
}

/**
 * Slice the category product grid only — the page also embeds a mixed-franchise
 * sidebar of recent items before `category_title`.
 */
export function extractHatatoyCategoryListHtml(html: string): string | null {
  const cat = html.search(/class=["']?category_title["']?/i);
  if (cat < 0) return null;
  const from = html.slice(cat);
  const m = from.match(/<table\s+class=["']list["'][^>]*>([\s\S]*?)<\/table>/i);
  return m?.[1] ?? null;
}

export function extractPrintedFromHatatoyTitle(
  title: string,
): { printed: string; number: string } | null {
  const m = title.match(PRINTED_RE);
  if (!m) return null;
  const number = parseDbsjccNumber(m[1]!);
  if (!number) return null;
  const prefix = number.startsWith("sp") ? "SP" : "D";
  const n = Number.parseInt(number.replace(/^[a-z]+/, ""), 10);
  return { printed: `${prefix}-${n}`, number };
}

/**
 * DB volume in title → FR part set (`DB10` → `part10`).
 * SP collector numbers always map to `sp`.
 */
export function extractSetHintFromHatatoyTitle(
  title: string,
  printedNumber: string,
): string | null {
  if (printedNumber.startsWith("sp")) return "sp";
  const db = title.match(/\bDB\s*(\d{1,2})\b/i);
  if (db) {
    const n = Number.parseInt(db[1]!, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return `part${n}`;
  }
  return null;
}

/** Strip brand, DB volume, collector number, and trailing rarity tokens. */
export function extractJaTitleFromHatatoyTitle(title: string): string | null {
  let t = title.trim();
  if (!t) return null;
  t = t.replace(/^バンダイ\s*/u, "");
  t = t.replace(/^ドラゴンボール\s*/u, "");
  t = t.replace(/\bDB\s*\d{1,2}\b/gi, " ");
  t = t.replace(/\b(?:SP|D)\s*[-_]?\s*\d+\b/gi, " ");
  t = t.replace(/[☆★]\s*\d+/gu, " ");
  t = t.replace(
    /(?:レア|ホロ|ノーマル|コモン|アンコモン|プロモ|キラ|パラレル)\s*/gu,
    " ",
  );
  t = t.replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * Same ambiguity rules as Chitoroshop (setHint → lowest partN → skip pouvoirs).
 */
export function matchHatatoyToDbsjccPrint(
  number: string,
  setHint: string | null,
  candidates: readonly DbsjccPrintCandidate[],
): HatatoyMatchResult {
  return matchChitoroshopToDbsjccPrint(number, setHint, candidates);
}

export type HatatoyListingProduct = {
  pid: string;
  title: string;
  thumbUrl: string | null;
};

export function parseHatatoyCategoryListing(
  html: string,
): HatatoyListingProduct[] {
  const block = extractHatatoyCategoryListHtml(html);
  if (!block) return [];
  const rows: HatatoyListingProduct[] = [];
  const seen = new Set<string>();

  // Walk each product row (tr) so thumb + name stay paired.
  const trChunks = block.split(/<\/tr>/i);
  for (const chunk of trChunks) {
    NAME_ROW_RE.lastIndex = 0;
    const name = NAME_ROW_RE.exec(chunk);
    if (!name) continue;
    const pid = name[1]!;
    const title = name[2]!.replace(/\s+/g, " ").trim();
    if (!pid || !title || seen.has(pid)) continue;
    seen.add(pid);
    const thumb = chunk.match(THUMB_IN_ROW_RE)?.[1] ?? null;
    rows.push({ pid, title, thumbUrl: thumb });
  }
  return rows;
}

export function facesFromHatatoyListings(
  products: readonly HatatoyListingProduct[],
): HatatoyFaceRow[] {
  const faces: HatatoyFaceRow[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const parsed = extractPrintedFromHatatoyTitle(product.title);
    if (!parsed) continue;
    if (seen.has(parsed.number)) continue;
    seen.add(parsed.number);
    const url = product.thumbUrl
      ? preferHatatoyFullImage(product.thumbUrl)
      : hatatoyFullImageUrl(product.pid);
    faces.push({
      printed: parsed.printed,
      number: parsed.number,
      setHint: extractSetHintFromHatatoyTitle(product.title, parsed.number),
      pid: product.pid,
      productUrl: hatatoyProductUrl(product.pid),
      url,
      title: product.title,
      titleJa: extractJaTitleFromHatatoyTitle(product.title),
      ingest: true,
    });
  }
  faces.sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }),
  );
  return faces;
}

let cachedShopProIp: string | null | undefined;

async function resolveHatatoyHttpsAgent(): Promise<https.Agent | undefined> {
  try {
    await dns.lookup("hatatoy.shop");
    return undefined;
  } catch {
    // Custom domain sometimes NXDOMAIN while ColorMe shop-pro still serves it.
    if (cachedShopProIp === undefined) {
      try {
        const r = await dns.lookup("hatatoy.shop-pro.jp");
        cachedShopProIp = r.address;
      } catch {
        cachedShopProIp = null;
      }
    }
    if (!cachedShopProIp) return undefined;
    const ip = cachedShopProIp;
    return new https.Agent({
      lookup(hostname, options, callback) {
        const reply = (address: string, family: 4 | 6) => {
          if (options && "all" in options && options.all) {
            (
              callback as (
                err: NodeJS.ErrnoException | null,
                addresses: LookupAddress[],
              ) => void
            )(null, [{ address, family }]);
          } else {
            (
              callback as (
                err: NodeJS.ErrnoException | null,
                address: string,
                family: number,
              ) => void
            )(null, address, family);
          }
        };
        if (hostname === "hatatoy.shop") {
          reply(ip, 4);
          return;
        }
        void dns.lookup(hostname).then(
          (r) => reply(r.address, r.family as 4 | 6),
          (err: unknown) =>
            (callback as (err: NodeJS.ErrnoException | null) => void)(
              err as NodeJS.ErrnoException,
            ),
        );
      },
    });
  }
}

export async function fetchHatatoyCategoryPage(
  page: number,
): Promise<string> {
  const agent = await resolveHatatoyHttpsAgent();
  const res = await httpGet<ArrayBuffer>(hatatoyListingUrl(page), {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*",
    },
    timeout: 40_000,
    responseType: "arraybuffer",
    validateStatus: (status) => status === 200,
    ...(agent ? { httpsAgent: agent } : {}),
    noDedup: true,
  });
  return decodeHatatoyHtml(new Uint8Array(res.data as ArrayBuffer));
}

export async function fetchHatatoyDbsjccListings(
  opts: { maxPages?: number; delayMs?: number } = {},
): Promise<HatatoyListingProduct[]> {
  const maxPages = opts.maxPages ?? HATATOY_CATEGORY.pages;
  const delayMs = opts.delayMs ?? 200;
  const products: HatatoyListingProduct[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const html = await fetchHatatoyCategoryPage(page);
    const batch = parseHatatoyCategoryListing(html);
    for (const row of batch) {
      if (seen.has(row.pid)) continue;
      seen.add(row.pid);
      products.push(row);
    }
    if (batch.length === 0) break;
    if (page < maxPages && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return products;
}

export function buildHatatoyLedger(
  products: readonly HatatoyListingProduct[],
  observed = new Date().toISOString().slice(0, 10),
): HatatoyLedger {
  const faces = facesFromHatatoyListings(products);
  return {
    source:
      "hatatoy.shop — バンダイ ドラゴンボール Card Game singles (ColorMe / shop-pro.jp)",
    observed,
    ingest: "faces",
    crawl: true,
    note: "Boutique JA ColorMe (EUC-JP). Catégorie cbid=2849233&csid=31 (~878 / 12 / 74 pages). Grille table.list uniquement (pas la sidebar). Titres « バンダイ ドラゴンボール DB10 D-920 … ». DB N → partN ; faces art.hatatoy.* sous lang=ja.",
    listed: faces.length,
    faces,
  };
}

export function dbsJccHatatoyLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "hatatoy.json");
}

export function writeHatatoyLedger(
  ledger: HatatoyLedger,
  outPath = dbsJccHatatoyLedgerPath(),
): string {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return outPath;
}

export function readHatatoyLedger(
  ledgerPath = dbsJccHatatoyLedgerPath(),
): HatatoyLedger | null {
  if (!existsSync(ledgerPath)) return null;
  return JSON.parse(readFileSync(ledgerPath, "utf8")) as HatatoyLedger;
}

/** Live harvest → rewrite curated ledger. */
export async function harvestDbsJccHatatoyFaces(
  opts: { maxPages?: number; delayMs?: number } = {},
): Promise<{ products: number; faces: number; path: string }> {
  const products = await fetchHatatoyDbsjccListings(opts);
  const ledger = buildHatatoyLedger(products);
  const out = writeHatatoyLedger(ledger);
  return { products: products.length, faces: ledger.faces.length, path: out };
}
