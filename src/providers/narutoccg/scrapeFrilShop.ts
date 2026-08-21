/**
 * Install Fril / ラクマ seller photos as `art.fril.*`.
 *
 * Bounded on purpose: a fixed set of family queries, a page cap, one request at
 * a time with a delay. Not a crawl of the marketplace — the ledger
 * (`curated/sources/fril-rakuma-jp.json`) says so and this file honours it.
 *
 * Seller photos, not scans: `fril` sits at the bottom of the face ranking, and
 * only ever adds a face to a card that has none worth beating.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  narutoCardDiskFolder,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import { NARUTO_PACK_ID } from "./packs";
import {
  FRIL_ORIGIN,
  frilRefWithinPublishedRange,
  frilSearchUrl,
  parseFrilSearch,
  type FrilListing,
} from "./parseFrilListing";

export const NARUTO_STAGING_FRIL = path.join("staging", "fril");
export const FRIL_LANG = "ja";

/** One query per printed family — the site indexes the ref in the title. */
export const FRIL_QUERIES: readonly string[] = [
  "ナルト カードゲーム 忍",
  "ナルト カードゲーム 術",
  "ナルト カードゲーム 作",
  "ナルト カードゲーム 依",
  "ナルト カードゲーム 騎",
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 900;
const DEFAULT_MAX_PAGES = 3;
const MIN_BYTES = 8_000;

export type ScrapeFrilOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  maxPages?: number;
  queries?: readonly string[];
  /** Ledger only — never touch `cards/`. */
  stagingOnly?: boolean;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

async function fetchSearch(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "ja,en;q=0.8",
        Referer: FRIL_ORIGIN,
      },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 2_000 ? html : null;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA fril : recherche HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

async function downloadPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/*,*/*",
        Referer: FRIL_ORIGIN,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export type FrilInstallRow = FrilListing & { diskId: string };

/** Listings whose ref resolves to an id the catalogue already mints. */
export function frilInstallRows(
  items: readonly FrilListing[],
): FrilInstallRow[] {
  const rows: FrilInstallRow[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    // A number outside what Bandai published is a seller typo, not a card.
    if (!frilRefWithinPublishedRange(item.printedRef)) continue;
    const diskId = narutoDiskCardId(item.printedRef);
    if (!diskId || seen.has(diskId)) continue;
    seen.add(diskId);
    rows.push({ ...item, diskId });
  }
  return rows;
}

export async function scrapeFrilNarutoFaces(
  opts: ScrapeFrilOptions = {},
): Promise<{
  listed: number;
  rows: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_FRIL);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const maxPages = Math.max(1, opts.maxPages ?? DEFAULT_MAX_PAGES);
  const queries = opts.queries ?? FRIL_QUERIES;

  console.log(
    "── JA fril / ラクマ → art.fril (photo vendeur, dernier recours)",
  );
  const all: FrilListing[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const totals: Record<string, number | null> = {};
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      if (delayMs > 0) await sleep(delayMs);
      const html = await fetchSearch(frilSearchUrl(query, page));
      if (!html) break;
      const parsed = parseFrilSearch(html);
      if (page === 1) totals[query] = parsed.total;
      if (!parsed.items.length && !parsed.rejected.length) break;
      all.push(...parsed.items);
      rejected.push(...parsed.rejected);
    }
  }

  const rows = frilInstallRows(all);
  writeFileSync(
    path.join(staging, "listings.json"),
    `${JSON.stringify(
      {
        source: FRIL_ORIGIN,
        queries,
        maxPages,
        capturedAt: new Date().toISOString(),
        totals,
        listed: all.length,
        kept: rows.length,
        rejected,
        cards: rows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(
    `── JA fril : ${all.length} annonces retenues, ${rows.length} ids distincts (${rejected.length} écartées)`,
  );
  if (opts.stagingOnly) {
    return {
      listed: all.length,
      rows: rows.length,
      downloaded: 0,
      skipped: rows.length,
      failed: 0,
    };
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of rows) {
    const parsed = parseNarutoCollector(row.printedRef);
    const fallback = parsed ? narutoCardDiskFolder(parsed) : "ninja";
    const cardDir =
      narutoCardAbsDir(cardsDir, row.diskId, FRIL_LANG) ??
      path.join(cardsDir, fallback, row.diskId, FRIL_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "fril")) {
      skip += 1;
      continue;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await downloadPhoto(row.imageUrl);
    if (!buf) {
      fail += 1;
      console.log(`JA fril ${row.diskId} FAIL`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "fril",
      lang: FRIL_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      fril: true,
      listed: all.length,
      rows: rows.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return {
    listed: all.length,
    rows: rows.length,
    downloaded: ok,
    skipped: skip,
    failed: fail,
  };
}
