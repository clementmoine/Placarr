/**
 * Action module: pipeline/suruga.ts
 * Merged from: probeSurugaVol1Listings.ts, probeSurugaMissingVol1.ts, harvestSurugaCarddass.ts
 */

import "dotenv/config";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { httpGet } from "@/lib/http/httpClient";
import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import { dataRoot } from "@/lib/runtimeData";
import { NARUTO_PACK_ID } from "../identity";
import { carddasJpCardlistCards } from "../parse/bandai";
import {
  formatSurugaCarddassListingsTsv,
  loadSurugaCarddassCuratedListings,
  mergeSurugaCarddassListings,
  parseSurugaCarddassListingsTsv,
  parseSurugaCarddassSearchHtml,
  parseSurugaProductDetailHtml,
  SURUGA_CARDDASS_ORIGIN,
  surugaPrintedToDiskId,
  type SurugaCarddassListing,
} from "../parse/marketplace";
import { NARUTO_STAGING_SURUGA_CARDDASS } from "../scrape/marketplace";

// --- from probeSurugaVol1Listings.ts ---

/**
 * Live Suruga-ya product probe for GL6368xx SKUs missing from the curated TSV.
 * CDN JPEGs exist for many vol.1 holes; product HTML yields the 忍/術/作/依 code.
 */




const DEFAULT_DELAY_MS = 400;
const PROBE_START = 636_800;
const PROBE_END = 636_850;
const PROBE_PREFIX = "GL";

export type ProbeSurugaVol1ListingsOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  start?: number;
  end?: number;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

/** `packDir` is already `data/naruto/carddass` when passed from scrape. */
export function surugaVol1ProbesTsvPath(packDir?: string): string {
  const base = packDir ?? packRoot();
  return path.join(base, NARUTO_STAGING_SURUGA_CARDDASS, "vol1-probes.tsv");
}

export function loadSurugaVol1ProbeListings(
  root?: string,
): SurugaCarddassListing[] {
  const file = surugaVol1ProbesTsvPath(root);
  if (!existsSync(file)) return [];
  return parseSurugaCarddassListingsTsv(readFileSync(file, "utf8"));
}

function listingKey(row: SurugaCarddassListing): string {
  return `${row.id}\t${row.printed}`;
}

export async function probeSurugaVol1Listings(
  opts: ProbeSurugaVol1ListingsOptions = {},
): Promise<{ probed: number; added: number; skipped: number; failed: number }> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_SURUGA_CARDDASS);
  mkdirSync(staging, { recursive: true });
  const outFile = surugaVol1ProbesTsvPath(root);
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const start = opts.start ?? PROBE_START;
  const end = opts.end ?? PROBE_END;

  const known = new Set(
    loadSurugaCarddassCuratedListings().map((r) => r.id.toUpperCase()),
  );
  const existing = loadSurugaVol1ProbeListings(root);
  const seen = new Set(existing.map((r) => r.id.toUpperCase()));
  for (const id of known) seen.add(id);

  const lines = existing.length
    ? existing.map((r) => `${r.id}\t${r.printed}`)
    : ["# id\tprinted (live probe GL6368xx — merged at scrape time)"];

  let probed = 0;
  let added = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `── Suruga vol.1 probe GL${start}…GL${end} → ${path.basename(outFile)}`,
  );

  for (let n = start; n <= end; n += 1) {
    const id = `${PROBE_PREFIX}${n}`;
    if (seen.has(id)) {
      skipped += 1;
      continue;
    }
    probed += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const html = await fetchTextWithFlareFallback(
        `${SURUGA_CARDDASS_ORIGIN}/product/detail/${id}`,
        {
          headers: { Accept: "text/html,*/*" },
          timeout: 25_000,
          flareMaxTimeoutMs: 45_000,
        },
      );
      if (!html) {
        failed += 1;
        continue;
      }
      const row = parseSurugaProductDetailHtml(html, id);
      if (!row) {
        failed += 1;
        continue;
      }
      const key = listingKey(row);
      if (lines.some((line) => line === key)) {
        skipped += 1;
        seen.add(id);
        continue;
      }
      lines.push(key);
      seen.add(id);
      added += 1;
      console.log(`Suruga probe ${id} → ${row.printed}`);
    } catch {
      failed += 1;
    }
  }

  if (added > 0 || force || !existsSync(outFile)) {
    writeFileSync(outFile, `${lines.join("\n")}\n`);
  }

  console.log(
    JSON.stringify({
      surugaVol1Probe: true,
      probed,
      added,
      skipped,
      failed,
      outFile: path.relative(root, outFile),
    }),
  );
  return { probed, added, skipped, failed };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  probeSurugaVol1Listings().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// --- from probeSurugaMissingVol1.ts ---

/**
 * Fill vol.1 JA holes via Suruga-ya search + gap product IDs (Byparr).
 * Search HTML is Cloudflare-blocked without FLARESOLVERR_URL.
 */




const MISSING_VOL1_DELAY_MS = 450;
const CARDGAME_RE = /カードゲーム|card game|carddass|carddas|巻ノ/i;

export type ProbeSurugaMissingVol1Options = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  /** Probe these printed refs only (e.g. ["忍-3"]). */
  printed?: readonly string[];
  /** Also walk GL636801–816 gap IDs. */
  gapIds?: boolean;
};

function jaFaceMissing(packDir: string, diskId: string): boolean {
  const cardsDir = path.join(packDir, "cards");
  for (const family of ["ninja", "jutsu", "mission", "client"] as const) {
    const dir = path.join(cardsDir, family, diskId, "ja");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith("art.")) return false;
    }
  }
  return true;
}

function vol1MissingPrinted(packDir: string): string[] {
  const byPrinted = new Map<string, string>();
  for (const row of carddasJpCardlistCards()) {
    if (row.setCode !== "maki1") continue;
    byPrinted.set(row.printed, row.number);
  }
  const out: string[] = [];
  for (const [printed, number] of byPrinted) {
    if (jaFaceMissing(packDir, number)) out.push(printed);
  }
  return out.sort((a, b) => a.localeCompare(b, "ja"));
}

function isCarddassListing(htmlSlice: string, printed: string): boolean {
  if (!CARDGAME_RE.test(htmlSlice)) return false;
  if (/コレクションシール|データカードダス|NM-|DN-/i.test(htmlSlice))
    return false;
  return htmlSlice.includes(printed);
}

function searchUrl(printed: string): string {
  const q = encodeURIComponent(`NARUTO カードゲーム ${printed}`);
  return `https://www.suruga-ya.jp/search?category=5&search_word=${q}&search_box=1`;
}

function pickSearchHit(
  html: string,
  printed: string,
): SurugaCarddassListing | null {
  const target = printed.trim();
  const seen = new Set<string>();
  const hrefRe =
    /href="https:\/\/www\.suruga-ya\.jp\/product\/detail\/([A-Za-z0-9]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html))) {
    const id = m[1]!.toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const slice = html.slice(m.index, m.index + 3000);
    if (!isCarddassListing(slice, target)) continue;
    const parsed = parseSurugaProductDetailHtml(slice, id);
    if (parsed?.printed === target) return parsed;
  }
  return null;
}

async function probeProductId(
  productId: string,
  delayMs: number,
): Promise<SurugaCarddassListing | null> {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  const html = await fetchTextWithFlareFallback(
    `https://www.suruga-ya.jp/product/detail/${productId}`,
    { flareMaxTimeoutMs: 45_000 },
  );
  if (!html) return null;
  return parseSurugaProductDetailHtml(html, productId);
}

function appendProbeRows(
  packDir: string,
  added: SurugaCarddassListing[],
  force: boolean,
): number {
  const outFile = surugaVol1ProbesTsvPath(packDir);
  mkdirSync(path.dirname(outFile), { recursive: true });
  const existing = loadSurugaVol1ProbeListings(packDir);
  const known = new Set([
    ...loadSurugaCarddassCuratedListings().map((r) => r.id.toUpperCase()),
    ...existing.map((r) => r.id.toUpperCase()),
  ]);
  const lines = existing.length
    ? existing.map((r) => `${r.id}\t${r.printed}`)
    : ["# id\tprinted (search/gap probe — merged at scrape time)"];
  let n = 0;
  for (const row of added) {
    const id = row.id.toUpperCase();
    if (known.has(id)) continue;
    known.add(id);
    lines.push(`${id}\t${row.printed}`);
    n += 1;
  }
  if (n > 0 || force || !existsSync(outFile)) {
    writeFileSync(outFile, `${lines.join("\n")}\n`);
  }
  return n;
}

export async function probeSurugaMissingVol1(
  opts: ProbeSurugaMissingVol1Options = {},
): Promise<{
  searched: number;
  gapProbed: number;
  added: number;
  found: SurugaCarddassListing[];
}> {
  const packDir = packRoot(opts.root);
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const force = opts.force === true;
  const found: SurugaCarddassListing[] = [];
  const seenId = new Set<string>();

  const printedList = opts.printed?.length
    ? [...opts.printed]
    : vol1MissingPrinted(packDir);

  console.log(
    `── Suruga vol.1 search probe (${printedList.length} missing printed refs)`,
  );

  for (const printed of printedList) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const html = await fetchTextWithFlareFallback(searchUrl(printed), {
      flareMaxTimeoutMs: 45_000,
    });
    if (!html) {
      console.log(`Suruga search ${printed} FAIL`);
      continue;
    }
    const hit = pickSearchHit(html, printed);
    if (!hit || seenId.has(hit.id)) continue;
    seenId.add(hit.id);
    found.push(hit);
    console.log(`Suruga search ${printed} → ${hit.id}`);
  }

  let gapProbed = 0;
  if (opts.gapIds !== false) {
    console.log("── Suruga vol.1 gap IDs GL636801–816");
    for (let n = 801; n <= 816; n += 1) {
      const id = `GL636${n}`;
      gapProbed += 1;
      const row = await probeProductId(id, delayMs);
      if (!row || seenId.has(row.id)) continue;
      const disk = surugaPrintedToDiskId(row.printed);
      if (!disk?.startsWith("ni") || Number.parseInt(disk.slice(2), 10) > 70) {
        continue;
      }
      seenId.add(row.id);
      found.push(row);
      console.log(`Suruga gap ${id} → ${row.printed}`);
    }
  }

  const added = appendProbeRows(packDir, found, force);
  console.log(
    JSON.stringify({
      surugaMissingVol1: true,
      searched: printedList.length,
      gapProbed,
      added,
      found: found.map((r) => `${r.id}:${r.printed}`),
    }),
  );
  return { searched: printedList.length, gapProbed, added, found };
}

const missingVol1ThisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === missingVol1ThisFile) {
  const printed = process.argv.includes("--printed")
    ? process.argv.slice(process.argv.indexOf("--printed") + 1)
    : undefined;
  probeSurugaMissingVol1({
    printed: printed?.length ? printed : undefined,
    gapIds: !process.argv.includes("--no-gap"),
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// --- from harvestSurugaCarddass.ts ---

/**
 * Crawl suruga-ya.jp for Naruto Carddass tabletop listings (巻ノ…, 忍-, 術-, 作-, 依-)
 * and update curated/sources/suruga-ya-carddass-listings.tsv.
 *
 * Works through Japanese VPN or direct connection.
 */


const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const TSV_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-carddass-listings.tsv",
);

async function fetchSurugaHtml(url: string): Promise<string> {
  const res = await httpGet<string>(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      Referer: "https://www.suruga-ya.jp/",
    },
    responseType: "text",
    timeout: 15_000,
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  if (res.status >= 300 && res.status < 400 && res.headers.location) {
    const rawLoc = res.headers.location;
    const decodedLoc = Buffer.from(rawLoc, "latin1").toString("utf8");
    const nextUrl = encodeURI(decodeURI(decodedLoc));
    const res2 = await httpGet<string>(nextUrl, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        Referer: "https://www.suruga-ya.jp/",
      },
      responseType: "text",
      timeout: 15_000,
      validateStatus: (s) => s === 200,
    });
    return res2.data;
  }
  return res.data;
}

export async function harvestSurugaCarddass(options: {
  queries?: string[];
  maxPagesPerQuery?: number;
  delayMs?: number;
  tsvPath?: string;
} = {}): Promise<{
  before: number;
  after: number;
  added: number;
  tsvPath: string;
}> {
  const tsvPath = options.tsvPath ?? TSV_PATH;
  const delayMs = options.delayMs ?? 400;
  const maxPages = options.maxPagesPerQuery ?? 26;

  const queries = options.queries ?? [
    "NARUTO カードゲーム 忍-",
    "NARUTO カードゲーム 術-",
    "NARUTO カードゲーム 作-",
    "NARUTO カードゲーム 依-",
    "NARUTO カードゲーム 巻ノ",
    "NARUTO カードダス 忍-",
    "NARUTO カードダス 術-",
    "NARUTO カードダス 作-",
    "NARUTO カードダス 依-",
  ];

  const existing: SurugaCarddassListing[] = existsSync(tsvPath)
    ? parseSurugaCarddassListingsTsv(readFileSync(tsvPath, "utf8"))
    : [];
  const before = existing.length;

  const byId = new Map<string, SurugaCarddassListing>();
  for (const item of existing) {
    byId.set(item.id, item);
  }

  for (const q of queries) {
    console.log(`\n=== Harvesting Carddass query: "${q}" ===`);
    let queryAdded = 0;

    for (let page = 1; page <= maxPages; page++) {
      const encodedWord = encodeURIComponent(q);
      const url = `https://www.suruga-ya.jp/search?category=5&search_word=${encodedWord}&page=${page}`;

      try {
        console.log(`[suruga-carddass] "${q}" page ${page}...`);
        const html = await fetchSurugaHtml(url);

        if (!html || html.includes("Just a moment...")) {
          console.warn(
            `[suruga-carddass] Cloudflare challenge on page ${page}, stopping query.`,
          );
          break;
        }

        const items = parseSurugaCarddassSearchHtml(html);
        let pageAdded = 0;
        for (const item of items) {
          if (!byId.has(item.id)) {
            byId.set(item.id, item);
            pageAdded++;
            queryAdded++;
          }
        }

        console.log(
          `[suruga-carddass] Page ${page}: ${items.length} items parsed (+${pageAdded} new, total: ${byId.size})`,
        );

        if (!html.includes(`page=${page + 1}`) || items.length === 0) {
          console.log(`[suruga-carddass] No next page for "${q}".`);
          break;
        }

        await sleep(delayMs);
      } catch (err: unknown) {
        console.error(
          `[suruga-carddass] Error on page ${page}:`,
          err instanceof Error ? err.message : err,
        );
        break;
      }
    }

    console.log(
      `[suruga-carddass] Query "${q}" finished: +${queryAdded} new listings.`,
    );
  }

  const allListings = Array.from(byId.values());
  writeFileSync(tsvPath, formatSurugaCarddassListingsTsv(allListings), "utf8");

  const after = allListings.length;
  const added = after - before;

  console.log(
    `\n[suruga-carddass] Summary: before=${before}, after=${after}, added=${added}`,
  );

  return { before, after, added, tsvPath };
}

const isDirectCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCli) {
  harvestSurugaCarddass().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
