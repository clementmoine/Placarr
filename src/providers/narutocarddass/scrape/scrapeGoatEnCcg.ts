/**
 * Goat singles for EN CCG s1–s27: titles + shop-served 350×490 faces.
 * Storm 3 stays stop2shop (`s28` skipped). Kept as `art.goat.*` beside
 * Vintage — skip only if this source is already on disk.
 */
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import goatLedger from "../curated/sources/goat-en-ccg.json";
import { NARUTO_PACK_ID } from "../packs";
import { narutoCardAbsDir } from "../narutoCardDisk";
import { upsertNarutoAppearances } from "../migrateCardLayout";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import {
  mergeGoatEnCcgCardsIntoIndex,
  parseGoatEnCcgListing,
  type GoatEnCcgCard,
} from "../parse/parseGoatEnCcg";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";

export const NARUTO_STAGING_GOAT_EN = path.join("staging", "goat-en-ccg");
const ORIGIN = "https://goatcardsshop.crystalcommerce.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 200;
const DEFAULT_CONCURRENCY = 4;
const MIN_BYTES = 4_000;
export const GOAT_EN_CCG_LANG = "en";

const SKIP_SET = new Set(["s28"]);

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type GoatSet = {
  id: number;
  setCode: string;
  slug: string;
  role?: string;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function goatEnCcgLedgerPath(packDir?: string): string {
  return path.join(packDir ?? packRoot(), NARUTO_STAGING_GOAT_EN, "cards.json");
}

export function goatEnCcgSetsToScrape(): GoatSet[] {
  return (goatLedger.sets as GoatSet[]).filter(
    (row) =>
      row.role !== "reprints-drawer" &&
      !SKIP_SET.has(row.setCode) &&
      /^s(?:[1-9]|1\d|2[0-7])$/.test(row.setCode),
  );
}

export function loadGoatEnCcgLedger(packDir?: string): GoatEnCcgCard[] {
  const file = goatEnCcgLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is GoatEnCcgCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as GoatEnCcgCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.setCode === "string"
      );
    });
  } catch {
    return [];
  }
}

export function mergeGoatEnCcgIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergeGoatEnCcgCardsIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadGoatEnCcgLedger(input.packDir),
  });
}

export type ScrapeGoatEnCcgOptions = {
  force?: boolean;
  delayMs?: number;
  concurrency?: number;
  root?: string;
  limitSets?: number;
  limit?: number;
};

function ledgerHasFaceUrls(cards: readonly GoatEnCcgCard[]): boolean {
  return cards.some((card) => Boolean(card.faceUrl));
}

/**
 * One catalogue page, with retries.
 *
 * The shop resets the connection every few dozen requests. Before this, a
 * single `ECONNRESET` rejected out of the whole walk and **every set already
 * harvested was lost** — 29 sets of work thrown away by one hiccup.
 */
async function fetchListingPage(
  url: string,
  delayMs: number,
): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await httpGet<string>(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        responseType: "text",
        timeout: 20_000,
        validateStatus: (status) => status === 200,
      });
      return typeof res.data === "string" ? res.data : "";
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (attempt === 3) {
        console.warn(
          `   goat HTTP ${err.code ?? "fail"} — ${err.message ?? error}`,
        );
        return null;
      }
      await sleep(Math.max(delayMs, 500) * attempt * 2);
    }
  }
  return null;
}

async function scrapeListings(
  sets: GoatSet[],
  delayMs: number,
): Promise<GoatEnCcgCard[]> {
  const byNumber = new Map<string, GoatEnCcgCard>();
  for (const set of sets) {
    let page = 1;
    let empty = 0;
    while (page <= 80) {
      const url = `${ORIGIN}/catalog/${set.slug}/${set.id}?page=${page}&sort_by_price=0`;
      const html = await fetchListingPage(url, delayMs);
      if (html === null) {
        // The shop hung up and kept hanging up: leave this set where it is
        // rather than lose the sets already walked.
        console.warn(`   goat ${set.setCode} p${page} — abandon après retries`);
        break;
      }
      const rows = parseGoatEnCcgListing(html, set.setCode);
      let added = 0;
      for (const row of rows) {
        const prev = byNumber.get(row.number);
        if (!prev) {
          byNumber.set(row.number, row);
          added += 1;
          continue;
        }
        if (!prev.faceUrl && row.faceUrl) prev.faceUrl = row.faceUrl;
      }
      if (added === 0) empty += 1;
      else empty = 0;
      if (empty >= 2 || rows.length === 0) break;
      page += 1;
      await sleep(delayMs);
    }
    console.log(
      `   goat ${set.setCode} → ${[...byNumber.values()].filter((c) => c.setCode === set.setCode).length} titres`,
    );
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

function writeLedger(dest: string, cards: GoatEnCcgCard[]): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: ORIGIN,
        generatedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: `${ORIGIN}/` },
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

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const n = Math.max(1, concurrency);
  await Promise.all(
    Array.from({ length: Math.min(n, items.length || 1) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    }),
  );
}

async function installGoatFaces(
  cards: readonly GoatEnCcgCard[],
  opts: ScrapeGoatEnCcgOptions,
): Promise<{
  downloaded: number;
  skipped: number;
  failed: number;
  noFace: number;
}> {
  const root = packRoot(opts.root);
  const cardsDir = path.join(root, "cards");
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  let withUrl = cards.filter((c) => c.faceUrl);
  if (opts.limit && opts.limit > 0) withUrl = withUrl.slice(0, opts.limit);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  await mapPool(withUrl, concurrency, async (card) => {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, GOAT_EN_CCG_LANG) ??
      path.join(cardsDir, "ninja", card.number, GOAT_EN_CCG_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "goat")) {
      skipped += 1;
      appearances.push({
        diskId: card.number,
        lang: GOAT_EN_CCG_LANG,
        appearanceSet: card.setCode,
      });
      return;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await downloadBytes(card.faceUrl!);
    if (!buf) {
      failed += 1;
      return;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "goat",
      lang: GOAT_EN_CCG_LANG,
      force,
    });
    appearances.push({
      diskId: card.number,
      lang: GOAT_EN_CCG_LANG,
      appearanceSet: card.setCode,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
  });

  if (appearances.length) upsertNarutoAppearances(root, appearances);
  return {
    downloaded,
    skipped,
    failed,
    noFace: cards.length - withUrl.length,
  };
}

export async function scrapeGoatEnCcgTitles(
  opts: ScrapeGoatEnCcgOptions = {},
): Promise<{ written: number; sets: number; downloaded: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = goatEnCcgLedgerPath(packDir);
  let cards = loadGoatEnCcgLedger(packDir);
  const delay = opts.delayMs ?? DEFAULT_DELAY_MS;
  const sets = goatEnCcgSetsToScrape().slice(0, opts.limitSets);
  const needListing =
    opts.force === true || cards.length === 0 || !ledgerHasFaceUrls(cards);

  if (needListing) {
    cards = await scrapeListings(sets, delay);
    writeLedger(dest, cards);
    console.log(`── goat EN titles : ${cards.length} écrits`);
  } else {
    console.log(`── goat EN titles : ${cards.length} déjà en staging`);
  }

  const faces = await installGoatFaces(cards, opts);
  console.log(
    JSON.stringify({
      goatEnFaces: true,
      listed: cards.length,
      ...faces,
    }),
  );
  return {
    written: cards.length,
    sets: needListing ? sets.length : 0,
    downloaded: faces.downloaded,
  };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeGoatEnCcgTitles().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
