/**
 * Naruto Carddass catalogues scrapers.
 */

import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import goatLedger from "../curated/sources/goat-en-ccg.json";
import { NARUTO_PACK_ID } from "../identity";
import { narutoCardAbsDir } from "../disk";
import { upsertNarutoAppearances } from "../pipeline";
import { existingNarutoArtForSource, extFromMagic, saveNarutoFace } from "../disk";
import {
  mergeGoatEnCcgCardsIntoIndex,
  parseGoatEnCcgListing,
  type GoatEnCcgCard,
  narutoCardsCaHintBelongsOnDisk,
  assignVintageNarutoDiskIds,
  parseVintageNarutoCcgBundle,
  VINTAGE_NARUTO_BROWSE_URL,
  VINTAGE_NARUTO_CCG_LANG,
  type VintageNarutoCcgCard,
  type VintageNarutoTitleHint,
  parseCollectorsCometProduct,
  type CollectorsCometCard,
  mergeCollectorsCometIntoIndex,
  decodeHinokunianHtml,
  hinokunianPageUrl,
  parseHinokunianPage,
  type HinokunianCard,
  cardgameclubItCuratedCards,
  mergeCardgameclubItCardsIntoIndex,
  parseCardgameclubItListing,
  parseCardgameclubItListingFaces,
  type CardgameclubItCard,
  type CardgameclubItFace,
  mergePrimegameItIntoIndex,
  parsePrimegameExpansions,
  parsePrimegameSinglesAjax,
  parsePrimegameSinglesResultCount,
  tcgTrendFaceUrl,
  type PrimegameItCard,
  type PrimegameItExpansion,
  NIKITA_NRT_IMG_PATH,
  NIKITA_NRT_LANG,
  NIKITA_NRT_ORIGIN,
  nikitaNrtFaceUrl,
  parseNikitaNrtImgList,
  type NikitaNrtCard,
  NIKITA_CARDLIST_PATH,
  parseNikitaCardlist,
  type NikitaCardFacts,
  mergeNarutoCardsCaIntoIndex,
  narutoCardsCaSetsToScrape,
  parseNarutoCardsCaSetHtml,
  type NarutoCardsCaCard,
  mergeNarutoCardsNetIntoIndex,
  parseNarutoCardsNetSitemap,
  type NarutoCardsNetCard,
} from "../parse/catalogues";
import { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import {
  narutoDiskCardId,
  narutoCardDiskFolder,
  parseNarutoCollector,
  mintNarutoPrintKey,
  narutoFamilyForPrefix,
} from "../identity";
import { bandaicgEnCardlistCards, parseEnCcgPrintedRef } from "../parse/bandai";
import ledger from "../curated/sources/collectors-comet.json";
import hinokunianJp from "../curated/sources/hinokunian-jp.json";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import narutocardsNet from "../curated/sources/narutocards-net.json";
import {
  ggArchiveIndexUrl,
  ggCardName,
  ggClassicImageUrl,
  parseGgCardIndex,
  type GgCard,
} from "@/providers/naruto/shared/gg/parseNarutoCardGameGg";
import zabuza from "../curated/sources/narutozabuza.json";

// ─── shared helpers ─────────────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const thisFile = fileURLToPath(import.meta.url);

// ─── scrapeGoatEnCcg ──────────────────────────────────────────────────────────

/**
 * Goat singles for EN CCG s1–s27: titles + shop-served 350×490 faces.
 * Storm 3 stays stop2shop (`s28` skipped). Kept as `art.goat.*` beside
 * Vintage — skip only if this source is already on disk.
 */
export const NARUTO_STAGING_GOAT_EN = path.join("staging", "goat-en-ccg");
const goatEnCcg_ORIGIN = "https://goatcardsshop.crystalcommerce.com";

const goatEnCcg_DEFAULT_DELAY_MS = 200;
const goatEnCcg_DEFAULT_CONCURRENCY = 4;
const goatEnCcg_MIN_BYTES = 4_000;
export const GOAT_EN_CCG_LANG = "en";

const SKIP_SET = new Set(["s28"]);

type GoatSet = {
  id: number;
  setCode: string;
  slug: string;
  role?: string;
};

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
      const url = `${goatEnCcg_ORIGIN}/catalog/${set.slug}/${set.id}?page=${page}&sort_by_price=0`;
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

function goatEnCcg_writeLedger(dest: string, cards: GoatEnCcgCard[]): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: goatEnCcg_ORIGIN,
        generatedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
}

async function goatEnCcg_downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: `${goatEnCcg_ORIGIN}/` },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= goatEnCcg_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function goatEnCcg_mapPool<T>(
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
  const delayMs = opts.delayMs ?? goatEnCcg_DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? goatEnCcg_DEFAULT_CONCURRENCY;
  let withUrl = cards.filter((c) => c.faceUrl);
  if (opts.limit && opts.limit > 0) withUrl = withUrl.slice(0, opts.limit);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  await goatEnCcg_mapPool(withUrl, concurrency, async (card) => {
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
    const buf = await goatEnCcg_downloadBytes(card.faceUrl!);
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
  const delay = opts.delayMs ?? goatEnCcg_DEFAULT_DELAY_MS;
  const sets = goatEnCcgSetsToScrape().slice(0, opts.limitSets);
  const needListing =
    opts.force === true || cards.length === 0 || !ledgerHasFaceUrls(cards);

  if (needListing) {
    cards = await scrapeListings(sets, delay);
    goatEnCcg_writeLedger(dest, cards);
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

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeGoatEnCcgTitles().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// ─── scrapeVintageNarutoCcg ──────────────────────────────────────────────────────────

/**
 * Install Vintage Naruto / CCG Trader 750×1050 EN faces into
 * `cards/{family}/{n0001}/en/` as `art.vintage.*`. Keep Goat (and every
 * other dump) beside them — skip only if this source is already on disk.
 */
export const NARUTO_STAGING_VINTAGE_NARUTO = path.join(
  "staging",
  "vintage-naruto-ccg",
);

const vintageNarutoCcg_DEFAULT_DELAY_MS = 80;
const vintageNarutoCcg_DEFAULT_CONCURRENCY = 6;
const vintageNarutoCcg_MIN_BYTES = 8_000;

export type ScrapeVintageNarutoOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  root?: string;
  bundleJs?: string;
};

export function vintageNarutoLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_VINTAGE_NARUTO,
    "cards.json",
  );
}

export function vintageNarutoTitleHints(
  packDir?: string,
): VintageNarutoTitleHint[] {
  const goat = loadGoatEnCcgLedger(packDir);
  const bandai = bandaicgEnCardlistCards();
  const attested = new Set<string>();
  for (const row of [...goat, ...bandai]) {
    attested.add((narutoDiskCardId(row.number) ?? row.number).toLowerCase());
  }
  const out: VintageNarutoTitleHint[] = [];
  for (const row of loadNarutoCardsCaLedger(packDir)) {
    if (!narutoCardsCaHintBelongsOnDisk(row, attested)) continue;
    out.push({ number: row.number, setCode: row.setCode, name: row.name });
  }
  for (const row of goat) {
    out.push({ number: row.number, setCode: row.setCode, name: row.name });
  }
  for (const row of bandai) {
    out.push({ number: row.number, setCode: row.setCode, name: row.name });
  }
  return out;
}

async function fetchText(
  url: string,
  referer?: string,
): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...(referer ? { Referer: referer } : {}),
      },
      responseType: "text",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 200 ? html : null;
  } catch {
    return null;
  }
}

export function vintageNarutoBundleSrc(html: string): string | null {
  const hit = /src="(\/assets\/index-[^"]+\.js)"/.exec(html);
  return hit ? `https://vintagenaruto.com${hit[1]}` : null;
}

async function vintageNarutoCcg_downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://vintagenaruto.com/",
        Origin: "https://vintagenaruto.com",
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= vintageNarutoCcg_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function vintageNarutoCcg_mapPool<T>(
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

function vintageNarutoCcg_writeLedger(dest: string, cards: VintageNarutoCcgCard[]): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: "vintagenaruto.com + api.ccgtrader.co.uk",
        generatedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
}

async function installFaces(
  cards: readonly VintageNarutoCcgCard[],
  opts: ScrapeVintageNarutoOptions,
): Promise<{
  downloaded: number;
  skipped: number;
  failed: number;
  unmapped: number;
}> {
  const root = packRoot(opts.root);
  const cardsDir = path.join(root, "cards");
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? vintageNarutoCcg_DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? vintageNarutoCcg_DEFAULT_CONCURRENCY;
  const mapped = cards.filter((c) => c.number && c.faceUrl);
  const work =
    opts.limit && opts.limit > 0 ? mapped.slice(0, opts.limit) : mapped;

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  await vintageNarutoCcg_mapPool(work, concurrency, async (card) => {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number!, VINTAGE_NARUTO_CCG_LANG) ??
      path.join(cardsDir, "ninja", card.number!, VINTAGE_NARUTO_CCG_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "vintage")) {
      skipped += 1;
      appearances.push({
        diskId: card.number!,
        lang: VINTAGE_NARUTO_CCG_LANG,
        appearanceSet: card.setCode,
      });
      return;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await vintageNarutoCcg_downloadBytes(card.faceUrl);
    if (!buf) {
      failed += 1;
      return;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "vintage",
      lang: VINTAGE_NARUTO_CCG_LANG,
      force,
    });
    appearances.push({
      diskId: card.number!,
      lang: VINTAGE_NARUTO_CCG_LANG,
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
    unmapped: cards.length - mapped.length,
  };
}

export async function scrapeVintageNarutoCcgFaces(
  opts: ScrapeVintageNarutoOptions = {},
): Promise<{ written: number; downloaded: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = vintageNarutoLedgerPath(packDir);
  let js = opts.bundleJs ?? null;
  if (!js && existsSync(dest) && opts.force !== true) {
    try {
      const raw = JSON.parse(readFileSync(dest, "utf8")) as {
        cards?: VintageNarutoCcgCard[];
      };
      if (Array.isArray(raw.cards) && raw.cards.length > 100) {
        const faces = await installFaces(raw.cards, opts);
        console.log(JSON.stringify({ vintageNarutoFaces: true, ...faces }));
        return { written: raw.cards.length, downloaded: faces.downloaded };
      }
    } catch {
      /* scrape fresh */
    }
  }
  if (!js) {
    const html = await fetchText(VINTAGE_NARUTO_BROWSE_URL);
    const src = html ? vintageNarutoBundleSrc(html) : null;
    js = src ? await fetchText(src, VINTAGE_NARUTO_BROWSE_URL) : null;
  }
  if (!js) {
    throw new Error("Vintage Naruto bundle introuvable");
  }
  const parsed = parseVintageNarutoCcgBundle(js);
  const cards = assignVintageNarutoDiskIds(
    parsed,
    vintageNarutoTitleHints(packDir),
  );
  vintageNarutoCcg_writeLedger(dest, cards);
  console.log(
    `── vintage EN faces : ${cards.length} listées, ${cards.filter((c) => c.number).length} mappées`,
  );
  const faces = await installFaces(cards, opts);
  console.log(JSON.stringify({ vintageNarutoFaces: true, ...faces }));
  return { written: cards.length, downloaded: faces.downloaded };
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeVintageNarutoCcgFaces().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// ─── scrapeCollectorsCometTitles ──────────────────────────────────────────────────────────

/**
 * Bandai USA CCG titles from collectorscomet.com ui-api.
 * Staging ledger only — no faces, no marketplace listings crawl.
 */
export const NARUTO_STAGING_COLLECTORS_COMET = path.join(
  "staging",
  "collectors-comet",
);

const collectorsCometTitles_DEFAULT_DELAY_MS = 120;

type CometEdition = { id: string; name: string };
type CometProduct = { name: string; number: string };

export function collectorsCometLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLLECTORS_COMET,
    "cards.json",
  );
}

export function loadCollectorsCometLedger(
  packDir?: string,
): CollectorsCometCard[] {
  const file = collectorsCometLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is CollectorsCometCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as CollectorsCometCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.setCode === "string" &&
        typeof card.printedRef === "string"
      );
    });
  } catch {
    return [];
  }
}

export function mergeCollectorsCometLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergeCollectorsCometIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadCollectorsCometLedger(input.packDir),
  });
}

export type ScrapeCollectorsCometOptions = {
  force?: boolean;
  delayMs?: number;
  root?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await httpGet<T>(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 30_000,
  });
  return res.data;
}

export async function scrapeCollectorsCometTitles(
  opts: ScrapeCollectorsCometOptions = {},
): Promise<{ written: number; editions: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = collectorsCometLedgerPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadCollectorsCometLedger(packDir);
    if (existing.length) {
      console.log(
        `── collectorscomet titles : ${existing.length} déjà en staging`,
      );
      return { written: existing.length, editions: 0 };
    }
  }

  const delay = opts.delayMs ?? collectorsCometTitles_DEFAULT_DELAY_MS;
  const editions = await fetchJson<CometEdition[]>(ledger.urls.editions);
  const byNumber = new Map<string, CollectorsCometCard>();

  for (const edition of editions) {
    await sleep(delay);
    const products = await fetchJson<CometProduct[]>(
      `${ledger.urls.products}${edition.id}`,
    );
    for (const product of products) {
      const row = parseCollectorsCometProduct(product, edition.name);
      if (!row || byNumber.has(row.number)) continue;
      byNumber.set(row.number, row);
    }
  }

  const cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    JSON.stringify(
      {
        source: ledger.source,
        generatedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `── collectorscomet titles : ${cards.length} cartes (${editions.length} éditions)`,
  );
  return { written: cards.length, editions: editions.length };
}

// ─── scrapeHinokunian ──────────────────────────────────────────────────────────

/**
 * Moisson du relevé 火の国庵 → `data/naruto/carddass/facts-hinokunian.json`.
 *
 * 53 pages, une par sortie japonaise : les 15 volumes, les starters nommés, les
 * feuilles jumbo, COIN＋, plus les 4 vagues Data Carddass. Chacune donne
 * référence, nom japonais et rareté.
 *
 * Fichier à part de `cards-index.json`, comme `facts-ja.json` : c'est un relevé
 * d'une source, pas le catalogue. Le versement dans les titres se décide après,
 * avec la corroboration des autres relevés.
 *
 * Le site est un site perso servi en SHIFT_JIS ; la cadence reste basse.
 */
export const HINOKUNIAN_FACTS_FILE = "facts-hinokunian.json";

const hinokunian_DEFAULT_DELAY_MS = 900;

export type HinokunianRelease = {
  path: string;
  label: string;
  cards: HinokunianCard[];
};

export type HinokunianFactsFile = {
  version: 1;
  source: string;
  lang: "ja";
  capturedAt: string;
  releaseCount: number;
  cardCount: number;
  releases: HinokunianRelease[];
};

/**
 * `root` est la **racine du pack** (`data/naruto/carddass`), comme partout
 * ailleurs dans ce module — `writeCarteSemaineReport` prend la même. Passer la
 * racine des données doublait le chemin en silence : la moisson restait
 * introuvable et le versement des noms ne nommait rien, sans une erreur.
 */
export function hinokunianFactsPath(root?: string): string {
  const pack = root ?? path.join(dataRoot(), NARUTO_PACK_ID);
  return path.join(pack, HINOKUNIAN_FACTS_FILE);
}

export function loadHinokunianFacts(root?: string): HinokunianFactsFile | null {
  try {
    const raw = JSON.parse(
      readFileSync(hinokunianFactsPath(root), "utf8"),
    ) as HinokunianFactsFile;
    return raw?.version === 1 && raw.releases ? raw : null;
  } catch {
    return null;
  }
}

/** Les pages déclarées au hinokunianJp. */
export function hinokunianPages(): { path: string; label: string }[] {
  return (hinokunianJp.pages ?? []) as { path: string; label: string }[];
}

async function fetchPage(url: string, delayMs: number): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await httpGet(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          "Accept-Language": "ja,en;q=0.8",
          Referer: "https://hinokunian.konohashigure.com/cardseal.html",
        },
        responseType: "arraybuffer",
        timeout: 25_000,
        validateStatus: (status) => status === 200,
      });
      const data = (res as { data?: ArrayBuffer }).data;
      return data ? decodeHinokunianHtml(new Uint8Array(data)) : null;
    } catch {
      if (attempt === 3) return null;
      await sleep(Math.max(delayMs, 600) * attempt * 2);
    }
  }
  return null;
}

/**
 * Les noms japonais du relevé, prêts à être versés : un identifiant de disque
 * et un nom, sans doublon.
 *
 * Une référence peut revenir dans plusieurs sorties — une réimpression garde
 * son numéro. Le premier nom rencontré gagne : ils concordent, et prendre le
 * dernier ferait dépendre le résultat de l'ordre des pages.
 *
 * Les cartes de borne (`DN`, `DT`) ne passent plus `narutoDiskCardId` :
 * Data Carddass a son provider (`narutodatacarddass`).
 */
export function hinokunianJaNames(
  root?: string,
): { diskHint: string; name: string }[] {
  const facts = loadHinokunianFacts(root);
  if (!facts) return [];
  const out: { diskHint: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const release of facts.releases) {
    for (const card of release.cards) {
      if (!card.name) continue;
      const disk = narutoDiskCardId(card.printed);
      if (!disk || seen.has(disk)) continue;
      seen.add(disk);
      out.push({ diskHint: disk, name: card.name });
    }
  }
  return out;
}

export async function scrapeHinokunian(
  opts: { root?: string; delayMs?: number; limit?: number } = {},
): Promise<{ releases: number; cards: number; failed: number; file: string }> {
  const delayMs = opts.delayMs ?? hinokunian_DEFAULT_DELAY_MS;
  let pages = hinokunianPages();
  if (opts.limit && opts.limit > 0) pages = pages.slice(0, opts.limit);

  console.log(`── 火の国庵 : ${pages.length} page(s) à lire`);
  const releases: HinokunianRelease[] = [];
  let failed = 0;
  for (const [index, page] of pages.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    const html = await fetchPage(hinokunianPageUrl(page.path), delayMs);
    const cards = html ? parseHinokunianPage(html) : [];
    if (!html) {
      failed += 1;
      continue;
    }
    releases.push({ path: page.path, label: page.label, cards });
    console.log(
      `   ${String(index + 1).padStart(2)}/${pages.length} ${page.label} → ${cards.length} cartes`,
    );
  }

  const cardCount = releases.reduce((sum, r) => sum + r.cards.length, 0);
  const file: HinokunianFactsFile = {
    version: 1,
    source: "https://hinokunian.konohashigure.com/",
    lang: "ja",
    capturedAt: new Date().toISOString(),
    releaseCount: releases.length,
    cardCount,
    releases,
  };
  const dest = hinokunianFactsPath(opts.root);
  if (!existsSync(path.dirname(dest))) {
    mkdirSync(path.dirname(dest), { recursive: true });
  }
  writeFileSync(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      hinokunian: true,
      releases: releases.length,
      cards: cardCount,
      failed,
    }),
  );
  return { releases: releases.length, cards: cardCount, failed, file: dest };
}

// ─── scrapeCardgameclubIt ──────────────────────────────────────────────────────────

/**
 * Italian Carddass S1–S6 singles from the old Magento catalog (Wayback).
 * Titles + 300×375 shop thumbnails with Italian card text.
 */
export const NARUTO_STAGING_CGC_IT = path.join("staging", "cardgameclub-it");
export const CARDGAMECLUB_IT_LANG = "it";
export const CARDGAMECLUB_IT_FACE_SOURCE = "cardgameclub" as const;

const cardgameclubIt_DEFAULT_DELAY_MS = 400;
const cardgameclubIt_MIN_FACE_BYTES = 2_000;
/** Magento cache JPEGs 404; a 45s Wayback hang per card killed the 2400s extract. */
export const CARDGAMECLUB_IT_FACE_TIMEOUT_MS = 8_000;
/** After this many consecutive JPEG misses, the rest of the Magento cache is dead. */
export const CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER = 3;

export function cardgameclubItShouldAbortFaceDownloads(
  consecutiveFails: number,
): boolean {
  return consecutiveFails >= CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER;
}

export const CARDGAMECLUB_IT_SERIES = [
  {
    setCode: "s1",
    slug: "serie-1-la-forza-della-foglia",
    pages: 8,
    wayback: "20220701234852",
  },
  {
    setCode: "s2",
    slug: "serie-2-le-spire-del-serpente",
    pages: 7,
    wayback: "20201030165412",
  },
  {
    setCode: "s3",
    slug: "serie-3-la-maledizione-della-sabbia",
    pages: 6,
    wayback: "20201026162215",
  },
  {
    setCode: "s4",
    slug: "serie-4-vendetta-e-redenzione",
    pages: 6,
    wayback: "20220527192328",
  },
  {
    setCode: "s5",
    slug: "serie-5-l-eredita-del-sogno",
    pages: 6,
    wayback: "20201031132030",
  },
  {
    setCode: "s6",
    slug: "serie-6-rivalita-eterna",
    pages: 6,
    wayback: "20220528162336",
  },
] as const;

const LIVE_HOSTS = [
  "https://www.cardgame-club.it",
  "https://www.cardgameclub.it",
] as const;

const WAYBACK_YEARS = ["2024", "2023", "2022", "2021", "2020"] as const;

export function cardgameclubItLedgerPath(packDir?: string): string {
  return path.join(packDir ?? packRoot(), NARUTO_STAGING_CGC_IT, "cards.json");
}

export function cardgameclubItFacesLedgerPath(packDir?: string): string {
  return path.join(packDir ?? packRoot(), NARUTO_STAGING_CGC_IT, "faces.json");
}

export function loadCardgameclubItLedger(
  packDir?: string,
): CardgameclubItCard[] {
  const file = cardgameclubItLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is CardgameclubItCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as CardgameclubItCard;
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

export function mergeCardgameclubItIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  const byNumber = new Map<string, CardgameclubItCard>();
  for (const row of [
    ...cardgameclubItCuratedCards(),
    ...loadCardgameclubItLedger(input.packDir),
  ]) {
    if (!byNumber.has(row.number)) byNumber.set(row.number, row);
  }
  return mergeCardgameclubItCardsIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: [...byNumber.values()],
  });
}

async function cardgameclubIt_fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 800 ? html : null;
  } catch {
    return null;
  }
}

function listingPath(slug: string, page: number): string {
  const base = `/brand/naruto/carte-singole-it/${slug}.html`;
  return page <= 1 ? base : `${base}?p=${page}`;
}

function waybackListingUrl(snapshot: string, rel: string): string {
  return `https://web.archive.org/web/${snapshot}/https://www.cardgame-club.it${rel}`;
}

function listingHasCards(html: string, setCode: string): boolean {
  return (
    parseCardgameclubItListing(html, setCode).length > 0 ||
    parseCardgameclubItListingFaces(html, setCode).length > 0
  );
}

async function fetchListingHtml(
  series: (typeof CARDGAMECLUB_IT_SERIES)[number],
  page: number,
  delayMs: number,
): Promise<string | null> {
  const rel = listingPath(series.slug, page);
  let html = await cardgameclubIt_fetchHtml(waybackListingUrl(series.wayback, rel));
  if (html && listingHasCards(html, series.setCode)) {
    return html;
  }
  for (const host of LIVE_HOSTS) {
    html = await cardgameclubIt_fetchHtml(`${host}${rel}`);
    if (html && listingHasCards(html, series.setCode)) {
      return html;
    }
  }
  for (const year of WAYBACK_YEARS) {
    html = await cardgameclubIt_fetchHtml(
      `https://web.archive.org/web/${year}/https://www.cardgame-club.it${rel}`,
    );
    if (html && listingHasCards(html, series.setCode)) {
      return html;
    }
    await sleep(delayMs);
  }
  return null;
}

async function cardgameclubIt_downloadFace(url: string): Promise<Buffer | null> {
  const candidates = [url];
  if (url.includes("web.archive.org/web/") && url.includes("im_/")) {
    candidates.push(url.replace("im_/", "id_/"));
  }
  for (const tryUrl of candidates) {
    const buf = await downloadCardFaceBytes(tryUrl, {
      minBytes: cardgameclubIt_MIN_FACE_BYTES,
      timeoutMs: CARDGAMECLUB_IT_FACE_TIMEOUT_MS,
      maxRedirects: 5,
    });
    if (buf && extFromMagic(buf) === ".jpg") return buf;
  }
  return null;
}

export type ScrapeCardgameclubItOptions = {
  force?: boolean;
  delayMs?: number;
  limit?: number;
  root?: string;
  /** Titles only — skip thumbnail download. */
  titlesOnly?: boolean;
  /** Re-download JPEGs from staging/cardgameclub-it/faces.json (skip listing crawl). */
  redownloadOnly?: boolean;
};

function loadCardgameclubItFacesLedger(packDir?: string): CardgameclubItFace[] {
  const file = cardgameclubItFacesLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { faces?: unknown };
    if (!Array.isArray(raw.faces)) return [];
    return raw.faces.filter((row): row is CardgameclubItFace => {
      if (!row || typeof row !== "object") return false;
      const face = row as CardgameclubItFace;
      return (
        typeof face.number === "string" &&
        typeof face.imageUrl === "string" &&
        typeof face.setCode === "string"
      );
    });
  } catch {
    return [];
  }
}

export async function scrapeCardgameclubItTitles(
  opts: ScrapeCardgameclubItOptions = {},
): Promise<{ written: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = cardgameclubItLedgerPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadCardgameclubItLedger(packDir);
    if (existing.length) {
      console.log(`── CGC IT titles : ${existing.length} déjà en staging`);
      return { written: existing.length };
    }
  }
  const delay = opts.delayMs ?? cardgameclubIt_DEFAULT_DELAY_MS;
  const byNumber = new Map<string, CardgameclubItCard>();

  for (const series of CARDGAMECLUB_IT_SERIES) {
    for (let page = 1; page <= series.pages; page += 1) {
      const html = await fetchListingHtml(series, page, delay);
      if (!html) continue;
      for (const row of parseCardgameclubItListing(html, series.setCode)) {
        if (!byNumber.has(row.number)) byNumber.set(row.number, row);
      }
      await sleep(delay);
    }
    console.log(
      `   CGC IT ${series.setCode} → ${[...byNumber.values()].filter((c) => c.setCode === series.setCode).length} titres`,
    );
  }

  const cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: "cardgame-club.it Magento / Wayback",
        generatedAt: new Date().toISOString(),
        ingest: "titles",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── CGC IT titles : ${cards.length} écrits`);
  return { written: cards.length };
}

export async function scrapeCardgameclubItFaces(
  opts: ScrapeCardgameclubItOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const rootDir = packRoot(opts.root);
  const cardsDir = path.join(rootDir, "cards");
  const staging = path.join(rootDir, NARUTO_STAGING_CGC_IT, "faces");
  mkdirSync(staging, { recursive: true });
  const delay = opts.delayMs ?? cardgameclubIt_DEFAULT_DELAY_MS;
  const force = opts.force === true;
  let faces: CardgameclubItFace[];
  let redownloadOnly = opts.redownloadOnly === true;
  if (redownloadOnly && !loadCardgameclubItFacesLedger(rootDir).length) {
    console.warn("── CGC IT : faces.json absent — crawl listings d'abord");
    redownloadOnly = false;
  }

  console.log("── CGC IT Wayback → art.cardgameclub (locale it)");
  const existingFaces = loadCardgameclubItFacesLedger(rootDir);
  if (!redownloadOnly && existingFaces.length && !force) {
    redownloadOnly = true;
    console.log(
      `── CGC IT faces hinokunianJp : ${existingFaces.length} URLs (skip listing crawl)`,
    );
  }
  if (!redownloadOnly) {
    await scrapeCardgameclubItTitles({ ...opts, force: opts.force === true });

    const byNumber = new Map<string, CardgameclubItFace>();
    for (const series of CARDGAMECLUB_IT_SERIES) {
      for (let page = 1; page <= series.pages; page += 1) {
        const html = await fetchListingHtml(series, page, delay);
        if (!html) continue;
        for (const row of parseCardgameclubItListingFaces(
          html,
          series.setCode,
        )) {
          if (!byNumber.has(row.number)) byNumber.set(row.number, row);
        }
        await sleep(delay);
      }
      console.log(
        `   CGC IT faces ${series.setCode} → ${[...byNumber.values()].filter((c) => c.setCode === series.setCode).length}`,
      );
    }
    faces = [...byNumber.values()].sort((a, b) =>
      a.number.localeCompare(b.number),
    );
    writeFileSync(
      cardgameclubItFacesLedgerPath(rootDir),
      `${JSON.stringify(
        {
          source: "cardgame-club.it Magento / Wayback",
          lang: CARDGAMECLUB_IT_LANG,
          generatedAt: new Date().toISOString(),
          ingest: "faces",
          faces,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    faces = loadCardgameclubItFacesLedger(rootDir);
    console.log(`── CGC IT faces hinokunianJp : ${faces.length} URLs`);
  }

  if (opts.limit && opts.limit > 0) faces = faces.slice(0, opts.limit);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveFails = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  for (let i = 0; i < faces.length; i += 1) {
    const face = faces[i]!;
    const cardDir = narutoCardAbsDir(
      cardsDir,
      face.number,
      CARDGAMECLUB_IT_LANG,
    );
    if (!cardDir) {
      failed += 1;
      continue;
    }
    if (
      !force &&
      existingNarutoArtForSource(cardDir, CARDGAMECLUB_IT_FACE_SOURCE)
    ) {
      skipped += 1;
      consecutiveFails = 0;
      appearances.push({
        diskId: face.number,
        lang: CARDGAMECLUB_IT_LANG,
        appearanceSet: face.setCode,
      });
      continue;
    }
    if (cardgameclubItShouldAbortFaceDownloads(consecutiveFails)) {
      const rest = faces.length - i;
      failed += rest;
      console.warn(
        `── CGC IT : cache Magento JPEG absent — skip ${rest} remaining (Wayback 404)`,
      );
      break;
    }
    const buf = await cardgameclubIt_downloadFace(face.imageUrl);
    if (!buf) {
      consecutiveFails += 1;
      failed += 1;
      console.log(`CGC IT ${face.number} FAIL`);
      continue;
    }
    consecutiveFails = 0;
    const stagingFile = path.join(staging, face.setCode, `${face.number}.jpg`);
    mkdirSync(path.dirname(stagingFile), { recursive: true });
    writeFileSync(stagingFile, buf);
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: CARDGAMECLUB_IT_FACE_SOURCE,
      lang: CARDGAMECLUB_IT_LANG,
      force,
    });
    appearances.push({
      diskId: face.number,
      lang: CARDGAMECLUB_IT_LANG,
      appearanceSet: face.setCode,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
  }

  if (appearances.length) upsertNarutoAppearances(rootDir, appearances);
  console.log(
    JSON.stringify({
      cardgameclubItFaces: true,
      listed: faces.length,
      downloaded,
      skipped,
      failed,
    }),
  );
  return { listed: faces.length, downloaded, skipped, failed };
}

// ─── scrapePrimegameIt ──────────────────────────────────────────────────────────

/**
 * Primegame.it Italian singles — expansion rubrics + `/ajax/get_singles`.
 *
 * Stock was **0** on every Naruto rubric when probed 2026-09-02. The scraper
 * still writes staging so a later sync picks up tcg trend thumbs when listings
 * return. No store crawl — one POST per expansion page, same contract as the
 * site's own `aggiorna()` JS.
 */
export const NARUTO_STAGING_PRIMEGAME_IT = path.join("staging", "primegame-it");
export const PRIMEGAME_IT_LANG = "it";
export const PRIMEGAME_IT_FACE_SOURCE = "primegame" as const;
export const PRIMEGAME_IT_HUB = "https://www.primegame.it/Singole/Naruto";
export const PRIMEGAME_IT_AJAX = "https://www.primegame.it/ajax/get_singles";

const primegameIt_DEFAULT_DELAY_MS = 350;
const primegameIt_MIN_FACE_BYTES = 4_000;
const RECORDS_PER_PAGE = 48;

export function primegameItLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_PRIMEGAME_IT,
    "cards.json",
  );
}

export function primegameItExpansionsPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_PRIMEGAME_IT,
    "expansions.json",
  );
}

export function loadPrimegameItLedger(packDir?: string): PrimegameItCard[] {
  const file = primegameItLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is PrimegameItCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as PrimegameItCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.setCode === "string" &&
        typeof card.printedRef === "string" &&
        typeof card.productId === "number"
      );
    });
  } catch {
    return [];
  }
}

export function mergePrimegameItLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergePrimegameItIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadPrimegameItLedger(input.packDir),
  });
}

export type ScrapePrimegameItOptions = {
  force?: boolean;
  delayMs?: number;
  limit?: number;
  root?: string;
  /** Download tcg trend thumbs when rows exist. */
  faces?: boolean;
};

async function primegameIt_fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "text",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 500 ? html : null;
  } catch {
    return null;
  }
}

async function fetchSinglesPage(
  expansion: PrimegameItExpansion,
  page: number,
): Promise<string | null> {
  const body = new URLSearchParams({
    pagina: String(page),
    categoria: "Naruto",
    tipologia: "",
    stato: "",
    lingua: "",
    prezzi: "0",
    numrecpagina: String(RECORDS_PER_PAGE),
    ordine: "",
    modo: "grid",
    testo: "",
    sottocat: `${expansion.expansionId};`,
    categoriapag: "Naruto",
    singole: "true",
    rarita: "",
  });
  try {
    const res = await httpGet<string>(PRIMEGAME_IT_AJAX, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
      },
      data: body.toString(),
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 100 ? html : null;
  } catch {
    return null;
  }
}

async function primegameIt_downloadFace(url: string): Promise<Buffer | null> {
  const buf = await downloadCardFaceBytes(url, {
    minBytes: primegameIt_MIN_FACE_BYTES,
    timeoutMs: 20_000,
  });
  if (!buf || extFromMagic(buf) === ".bin") return null;
  return buf;
}

async function crawlExpansion(
  expansion: PrimegameItExpansion,
  delayMs: number,
): Promise<PrimegameItCard[]> {
  const byNumber = new Map<string, PrimegameItCard>();
  let page = 1;
  let total = 0;
  while (page <= 20) {
    const html = await fetchSinglesPage(expansion, page);
    if (!html) break;
    if (page === 1) total = parsePrimegameSinglesResultCount(html);
    for (const row of parsePrimegameSinglesAjax(html, expansion)) {
      if (!byNumber.has(row.number)) byNumber.set(row.number, row);
    }
    if (page * RECORDS_PER_PAGE >= total || total === 0) break;
    page += 1;
    await sleep(delayMs);
  }
  return [...byNumber.values()];
}

export async function scrapePrimegameIt(
  opts: ScrapePrimegameItOptions = {},
): Promise<{
  expansions: number;
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const rootDir = packRoot(opts.root);
  const staging = path.join(rootDir, NARUTO_STAGING_PRIMEGAME_IT);
  mkdirSync(staging, { recursive: true });
  const delay = opts.delayMs ?? primegameIt_DEFAULT_DELAY_MS;
  const force = opts.force === true;
  const cardsPath = primegameItLedgerPath(rootDir);
  const expansionsPath = primegameItExpansionsPath(rootDir);

  if (!force && existsSync(cardsPath) && existsSync(expansionsPath)) {
    const existing = loadPrimegameItLedger(rootDir);
    console.log(
      `── Primegame IT : ${existing.length} cartes en staging (skip — --force pour refetch)`,
    );
    return {
      expansions: JSON.parse(readFileSync(expansionsPath, "utf8")).expansions
        ?.length ?? 0,
      listed: existing.length,
      downloaded: 0,
      skipped: existing.length,
      failed: 0,
    };
  }

  console.log("── Primegame IT → staging/primegame-it (Singole/Naruto + ajax)");
  const hub = await primegameIt_fetchHtml(PRIMEGAME_IT_HUB);
  if (!hub) {
    console.warn("── Primegame IT : hub inaccessible");
    return { expansions: 0, listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  }
  const expansions = parsePrimegameExpansions(hub);
  writeFileSync(
    expansionsPath,
    `${JSON.stringify(
      {
        source: PRIMEGAME_IT_HUB,
        observed: new Date().toISOString(),
        expansions,
      },
      null,
      2,
    )}\n`,
  );

  const byNumber = new Map<string, PrimegameItCard>();
  for (const expansion of expansions) {
    if (!expansion.setCode || expansion.setCode === "s7" || expansion.setCode === "s8") {
      console.log(
        `   Primegame ${expansion.slug} (${expansion.expansionId}) → skip titres (set ${expansion.setCode ?? "?"} hors catalogue)`,
      );
      continue;
    }
    const rows = await crawlExpansion(expansion, delay);
    for (const row of rows) byNumber.set(row.number, row);
    console.log(
      `   Primegame ${expansion.setCode} (${expansion.expansionId}) → ${rows.length} en stock`,
    );
    await sleep(delay);
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
  if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit);

  writeFileSync(
    cardsPath,
    `${JSON.stringify(
      {
        source: PRIMEGAME_IT_AJAX,
        lang: PRIMEGAME_IT_LANG,
        generatedAt: new Date().toISOString(),
        ingest: "titles",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── Primegame IT : ${cards.length} cartes, ${expansions.length} rubriques`);

  if (opts.faces !== true || cards.length === 0) {
    return {
      expansions: expansions.length,
      listed: cards.length,
      downloaded: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const cardsDir = path.join(rootDir, "cards");
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  for (const card of cards) {
    const cardDir = narutoCardAbsDir(cardsDir, card.number, PRIMEGAME_IT_LANG);
    if (!cardDir) {
      failed += 1;
      continue;
    }
    appearances.push({
      diskId: card.number,
      lang: PRIMEGAME_IT_LANG,
      appearanceSet: card.setCode,
    });
    if (
      !force &&
      existingNarutoArtForSource(cardDir, PRIMEGAME_IT_FACE_SOURCE)
    ) {
      skipped += 1;
      continue;
    }
    const url = card.thumbUrl ?? tcgTrendFaceUrl(card.productId);
    const buf = await primegameIt_downloadFace(url);
    if (!buf) {
      failed += 1;
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: PRIMEGAME_IT_FACE_SOURCE,
      lang: PRIMEGAME_IT_LANG,
      force,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
    await sleep(delay);
  }
  upsertNarutoAppearances(rootDir, appearances);
  return {
    expansions: expansions.length,
    listed: cards.length,
    downloaded,
    skipped,
    failed,
  };
}

// ─── scrapeNikitaNrt ──────────────────────────────────────────────────────────

/**
 * Install nikita.jp JP Carddass scans into `cards/{family}/{ni0001}/ja/`.
 *
 * N/J/S/I are 忍/術/作/依 — never EN CCG `n/j`. Staging hinokunianJp only besides
 * the catalogue JPEGs.
 */
export const NARUTO_STAGING_NIKITA_NRT = path.join("staging", "nikita-nrt");

const nikitaNrt_DEFAULT_DELAY_MS = 120;
const nikitaNrt_DEFAULT_CONCURRENCY = 4;
const nikitaNrt_MIN_BYTES = 4_000;

export type ScrapeNikitaNrtOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  root?: string;
};

export function nikitaNrtLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NIKITA_NRT,
    "cards.json",
  );
}

export function loadNikitaNrtLedger(packDir?: string): NikitaNrtCard[] {
  const file = nikitaNrtLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is NikitaNrtCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as NikitaNrtCard;
      return (
        typeof card.number === "string" && typeof card.imagePath === "string"
      );
    });
  } catch {
    return [];
  }
}

async function nikitaNrt_fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        "Accept-Language": "ja,en;q=0.8",
        Referer: `${NIKITA_NRT_ORIGIN}/explist/nrt/`,
      },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    if (html.length < 400) {
      console.warn(
        `── JA nikita : listing trop courte (${html.length} o, http ${res.status})`,
      );
      return null;
    }
    return html;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA nikita : listing HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

async function nikitaNrt_downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        Referer: `${NIKITA_NRT_ORIGIN}${NIKITA_NRT_IMG_PATH}`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= nikitaNrt_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function nikitaNrt_mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const n = Math.max(1, concurrency);
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    }),
  );
}

export async function scrapeNikitaNrtCards(
  opts: ScrapeNikitaNrtOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_NIKITA_NRT);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? nikitaNrt_DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? nikitaNrt_DEFAULT_CONCURRENCY;

  console.log("── JA nikita.jp Carddass → cards/{family}/{id}/ja/");
  const html = await nikitaNrt_fetchHtml(`${NIKITA_NRT_ORIGIN}${NIKITA_NRT_IMG_PATH}`);
  if (!html) {
    console.warn("── JA nikita : listing absente, on s'arrête là");
    return { listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  }
  writeFileSync(path.join(staging, "listing-img.html"), html, "utf8");

  let cards = parseNikitaNrtImgList(html);
  if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit);
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${NIKITA_NRT_ORIGIN}${NIKITA_NRT_IMG_PATH}`,
        lang: NIKITA_NRT_LANG,
        capturedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── JA nikita listing : ${cards.length} faces`);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  const appearances: { diskId: string; lang: string; appearanceSet: string }[] =
    [];

  await nikitaNrt_mapPool(cards, concurrency, async (card) => {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, NIKITA_NRT_LANG) ??
      path.join(cardsDir, "ninja", card.number, NIKITA_NRT_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "nikita")) {
      skip += 1;
      if (card.setCode) {
        appearances.push({
          diskId: card.number,
          lang: NIKITA_NRT_LANG,
          appearanceSet: card.setCode,
        });
      }
      return;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await nikitaNrt_downloadBytes(nikitaNrtFaceUrl(card.imagePath));
    if (!buf) {
      fail += 1;
      console.log(`JA nikita ${card.number} FAIL`);
      return;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "nikita",
      lang: NIKITA_NRT_LANG,
      force,
    });
    if (card.setCode) {
      appearances.push({
        diskId: card.number,
        lang: NIKITA_NRT_LANG,
        appearanceSet: card.setCode,
      });
    }
    if (saved === "skip") skip += 1;
    else ok += 1;
  });

  if (appearances.length) upsertNarutoAppearances(root, appearances);
  console.log(
    JSON.stringify({
      nikitaNrt: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: cards.length, downloaded: ok, skipped: skip, failed: fail };
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeNikitaNrtCards().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// ─── scrapeNikitaCardlist ──────────────────────────────────────────────────────────

/**
 * Pull the JP game data from nikita's text card list.
 *
 * The face pass (`scrapeNikitaNrt`) already visits the same site in `?mode=img`.
 * This one takes the other view — one page, 428 cards, with symbol, cost, the
 * four combat values, traits, battle attribute, target/effect and the flavour
 * line. It **joins onto ids we already hold** and never mints a print.
 *
 * The facts land in their own file rather than in `cards-index.json`:
 * `CardsIndexLangFiles` is shared by every pack, and a Naruto-only stat block
 * has no business in Lorcana's or Pokémon's shape. Same reasoning as the DBS
 * `masters_superset.json`.
 */
export const NARUTO_STAGING_NIKITA_NRT_LIST = path.join(
  "staging",
  "nikita-nrt",
);
export const NARUTO_JA_FACTS_FILE = "facts-ja.json";
/** The 疾風伝 game on the same site — 忍伝 / 術伝 / 作伝, our `shi` / `mju` / `msa`. */
export const NIKITA_SHIPPUDEN_PATH = "/cardlist/nrts";

export type ScrapeNikitaCardlistOptions = {
  root?: string;
  /** Parse a file already on disk instead of fetching. */
  html?: string;
};

export type NarutoJaFactsFile = {
  version: 1;
  source: string;
  capturedAt: string;
  count: number;
  /** Keyed by disk id (`ni0001`) — the join key the rest of the pack speaks. */
  cards: Record<string, NarutoJaFacts>;
};

export function narutoJaFactsPath(root?: string): string {
  /*
    `root` is already the pack dir when called from scrapeCards. Joining
    NARUTO_PACK_ID again silently doubled the path and the names never landed.
  */
  const pack = root ?? path.join(dataRoot(), NARUTO_PACK_ID);
  return path.join(pack, NARUTO_JA_FACTS_FILE);
}

export function loadNarutoJaFacts(root?: string): NarutoJaFactsFile | null {
  try {
    const raw = JSON.parse(
      readFileSync(narutoJaFactsPath(root), "utf8"),
    ) as NarutoJaFactsFile;
    return raw?.version === 1 && raw.cards ? raw : null;
  } catch {
    return null;
  }
}

/** Names only — combat stats stay in `facts-ja.json`, not `cards-index.json`. */
export function nikitaFactsJaNames(
  root?: string,
): { diskHint: string; name: string }[] {
  const facts = loadNarutoJaFacts(root);
  if (!facts) return [];
  const out: { diskHint: string; name: string }[] = [];
  for (const [diskHint, card] of Object.entries(facts.cards)) {
    const name = card.name?.trim();
    if (!diskHint || !name) continue;
    out.push({ diskHint, name });
  }
  return out;
}

export type NarutoJaFacts = NikitaCardFacts & {
  /** Other set labels the site files the same number under, same data. */
  alsoListedIn?: string[];
  /**
   * Rows that share the number but say something different — a reprint whose
   * flavour line or rules wording changed between volumes. Kept whole: dropping
   * them would erase the only record that the card was printed twice.
   */
  variants?: NikitaCardFacts[];
};

/** What makes two rows the same card *printing*, set label aside. */
function factsSignature(row: NikitaCardFacts): string {
  return JSON.stringify([
    row.name,
    row.cardType,
    row.symbols,
    row.cost,
    row.power,
    row.support,
    row.woundedPower,
    row.woundedSupport,
    row.traits,
    row.battleAttribute,
    row.target,
    row.effect,
    row.quote,
  ]);
}

/**
 * Facts by disk id. Rows the catalogue does not mint are dropped, not invented.
 *
 * 33 numbers appear twice or three times. Most are the same card filed again
 * under nikita's `※確認中` (unverified) buckets — those collapse, their label
 * kept in `alsoListedIn`. But **five differ for real**: 忍-1 and 作-43 carry a
 * second flavour line, and 作-116 / 術-146 / 術-160 were reprinted in a later
 * volume with reworded rules. Those go to `variants` whole — a reprint is a
 * fact about the card, not noise to fold away.
 */
export function factsByDiskId(
  rows: readonly NikitaCardFacts[],
): Record<string, NarutoJaFacts> {
  const grouped = new Map<string, NikitaCardFacts[]>();
  for (const row of rows) {
    if (!row.number) continue;
    grouped.set(row.number, [...(grouped.get(row.number) ?? []), row]);
  }

  const out: Record<string, NarutoJaFacts> = {};
  for (const [id, group] of grouped) {
    // A resolved volume is the primary; an unverified bucket never wins.
    const primary = group.find((row) => row.setCode) ?? group[0]!;
    const entry: NarutoJaFacts = { ...primary };
    const labels: string[] = [];
    const variants: NikitaCardFacts[] = [];
    const primarySignature = factsSignature(primary);
    for (const row of group) {
      if (row === primary) continue;
      if (factsSignature(row) === primarySignature) {
        if (row.setLabel && row.setLabel !== primary.setLabel) {
          labels.push(row.setLabel);
        }
        continue;
      }
      variants.push(row);
    }
    if (labels.length) entry.alsoListedIn = [...new Set(labels)];
    if (variants.length) entry.variants = variants;
    out[id] = entry;
  }
  return out;
}

async function fetchCardlist(): Promise<string | null> {
  try {
    const res = await httpGet<string>(
      `${NIKITA_NRT_ORIGIN}${NIKITA_CARDLIST_PATH}`,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,*/*",
          "Accept-Language": "ja,en;q=0.8",
          Referer: `${NIKITA_NRT_ORIGIN}/explist/nrt/`,
        },
        responseType: "text",
        timeout: 30_000,
        validateStatus: (status) => status === 200,
      },
    );
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 2_000 ? html : null;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA nikita cardlist : HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

export async function scrapeNikitaCardlistFacts(
  opts: ScrapeNikitaCardlistOptions = {},
): Promise<{ parsed: number; joined: number; file: string | null }> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_NIKITA_NRT_LIST);
  mkdirSync(staging, { recursive: true });

  console.log("── JA nikita cardlist → facts-ja.json");
  const html = opts.html ?? (await fetchCardlist());
  if (!html) {
    console.warn("── JA nikita cardlist : page absente, on s'arrête là");
    return { parsed: 0, joined: 0, file: null };
  }
  writeFileSync(path.join(staging, "cardlist.html"), html, "utf8");

  const rows = parseNikitaCardlist(html);
  const cards = factsByDiskId(rows);
  const file: NarutoJaFactsFile = {
    version: 1,
    source: `${NIKITA_NRT_ORIGIN}${NIKITA_CARDLIST_PATH}`,
    capturedAt: new Date().toISOString(),
    count: Object.keys(cards).length,
    cards,
  };
  const dest = narutoJaFactsPath(opts.root);
  writeFileSync(dest, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      nikitaCardlist: true,
      parsed: rows.length,
      joined: file.count,
      unmapped: rows.filter((row) => !row.number).length,
    }),
  );
  return { parsed: rows.length, joined: file.count, file: dest };
}

async function fetchPath(pathname: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(`${NIKITA_NRT_ORIGIN}${pathname}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "ja,en;q=0.8",
        Referer: `${NIKITA_NRT_ORIGIN}/`,
      },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 1_000 ? html : null;
  } catch {
    return null;
  }
}

async function nikitaCardlist_downloadFace(url: string): Promise<Buffer | null> {
  const buf = await downloadCardFaceBytes(url, {
    referer: NIKITA_NRT_ORIGIN,
    minBytes: 3_000,
    timeoutMs: 30_000,
  });
  if (!buf || extFromMagic(buf) === ".bin") return null;
  return buf;
}

/**
 * The 疾風伝 game (`nrts`) — 13 cards, the only faces we have for that line.
 *
 * Its files are named `N-037.jpg` like the 巻ノ game's, but under `nrts` the
 * same letter means 忍伝, not 忍: joining on the letter would put a 疾風伝 face
 * on a booster card. The printed ref in the text view is what we join on.
 */
export async function scrapeNikitaShippudenFaces(
  opts: ScrapeNikitaCardlistOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const cardsDir = path.join(root, "cards");
  const staging = path.join(root, NARUTO_STAGING_NIKITA_NRT_LIST);
  mkdirSync(staging, { recursive: true });

  console.log("── JA nikita 疾風伝 (nrts) → art.nikita");
  const html = opts.html ?? (await fetchPath(NIKITA_SHIPPUDEN_PATH));
  if (!html) return { listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  writeFileSync(path.join(staging, "cardlist-nrts.html"), html, "utf8");

  const rows = parseNikitaCardlist(html).filter(
    (row) => row.game === "nrts" && row.number && row.nikitaKey,
  );
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of rows) {
    const parsed = parseNarutoCollector(row.printedRef);
    const fallback = parsed ? narutoCardDiskFolder(parsed) : "ninja";
    const cardDir =
      narutoCardAbsDir(cardsDir, row.number!, "ja") ??
      path.join(cardsDir, fallback, row.number!, "ja");
    if (existingNarutoArtForSource(cardDir, "nikita")) {
      skip += 1;
      continue;
    }
    const buf = await nikitaCardlist_downloadFace(
      `${NIKITA_NRT_ORIGIN}/img/card/nrts/${row.nikitaKey}.jpg`,
    );
    if (!buf) {
      fail += 1;
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "nikita",
      lang: "ja",
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }
  console.log(
    JSON.stringify({
      nikitaShippuden: true,
      listed: rows.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: rows.length, downloaded: ok, skipped: skip, failed: fail };
}

// ─── scrapeNarutoCardsCa ──────────────────────────────────────────────────────────

/**
 * Bandai CCG titles from narutocards.ca set pages.
 * Staging hinokunianJp only — no faces, no Kayou, no set 29.
 */
export const NARUTO_STAGING_NARUTOCARDS_CA = path.join(
  "staging",
  "narutocards-ca",
);
const narutoCardsCa_ORIGIN = "https://www.narutocards.ca";

const narutoCardsCa_DEFAULT_DELAY_MS = 250;

export function narutoCardsCaLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NARUTOCARDS_CA,
    "cards.json",
  );
}

export function loadNarutoCardsCaLedger(packDir?: string): NarutoCardsCaCard[] {
  const file = narutoCardsCaLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards
      .filter((row): row is NarutoCardsCaCard => {
        if (!row || typeof row !== "object") return false;
        const card = row as NarutoCardsCaCard;
        return (
          typeof card.number === "string" &&
          typeof card.name === "string" &&
          typeof card.setCode === "string"
        );
      })
      .map((row) => {
        /*
          Le cache peut dater d'avant la convention PR-US → prus : il stocke
          alors `pr006-us` là où le parseur produit `prus006`. Le `printedRef`
          est l'autorité — le numéro stocké n'en est que la dérivation.
        */
        if (typeof row.printedRef !== "string") return row;
        const parsed = parseEnCcgPrintedRef(row.printedRef);
        if (!parsed?.number || parsed.number === row.number) return row;
        return {
          ...row,
          number: parsed.number,
          usExclusive: parsed.usExclusive,
        };
      });
  } catch {
    return [];
  }
}
export function mergeNarutoCardsCaLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergeNarutoCardsCaIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadNarutoCardsCaLedger(input.packDir),
  });
}

export type ScrapeNarutoCardsCaOptions = {
  force?: boolean;
  delayMs?: number;
  root?: string;
  limitSets?: number;
};

export async function scrapeNarutoCardsCaTitles(
  opts: ScrapeNarutoCardsCaOptions = {},
): Promise<{ written: number; sets: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = narutoCardsCaLedgerPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadNarutoCardsCaLedger(packDir);
    if (existing.length) {
      console.log(
        `── narutocards.ca titles : ${existing.length} déjà en staging`,
      );
      return { written: existing.length, sets: 0 };
    }
  }
  const delay = opts.delayMs ?? narutoCardsCa_DEFAULT_DELAY_MS;
  const sets = narutoCardsCaSetsToScrape().slice(0, opts.limitSets);
  const byNumber = new Map<string, NarutoCardsCaCard>();

  for (const set of sets) {
    const url = `${narutoCardsCa_ORIGIN}/sets/bandai-ccg/${set.slug}`;
    try {
      const res = await httpGet<string>(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        responseType: "text",
        timeout: 25_000,
        validateStatus: (status) => status === 200,
      });
      const html = typeof res.data === "string" ? res.data : "";
      for (const row of parseNarutoCardsCaSetHtml(html, set.setCode)) {
        if (!byNumber.has(row.number)) byNumber.set(row.number, row);
      }
    } catch {
      // Keep going — one dead set must not drop the rest.
    }
    console.log(
      `   narutocards.ca ${set.setCode} → ${[...byNumber.values()].filter((c) => c.setCode === set.setCode).length} titres`,
    );
    await sleep(delay);
  }

  const cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: narutoCardsCa_ORIGIN,
        generatedAt: new Date().toISOString(),
        ingest: "titles",
        skip: ["kayou", "bandai-ccg-29"],
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── narutocards.ca titles : ${cards.length} écrits`);
  return { written: cards.length, sets: sets.length };
}

// ─── scrapeNarutoCardsNet ──────────────────────────────────────────────────────────

/**
 * Harvest EN CCG titles from narutocards.net sitemap (slug-derived names).
 */
export const NARUTO_STAGING_NARUTOCARDS_NET = path.join(
  "staging",
  "narutocards-net",
);

export function narutoCardsNetLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NARUTOCARDS_NET,
    "cards.json",
  );
}

export function narutoCardsNetSitemapPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NARUTOCARDS_NET,
    "sitemap.xml",
  );
}

function readNarutoCardsNetLedgerJson(
  packDir?: string,
): NarutoCardsNetCard[] {
  const file = narutoCardsNetLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is NarutoCardsNetCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as NarutoCardsNetCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.printedRef === "string"
      );
    });
  } catch {
    return [];
  }
}

export function parseNarutoCardsNetLedgerFromStaging(
  packDir?: string,
): NarutoCardsNetCard[] {
  const file = narutoCardsNetSitemapPath(packDir);
  if (!existsSync(file)) return [];
  try {
    return parseNarutoCardsNetSitemap(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

export function loadNarutoCardsNetLedger(
  packDir?: string,
): NarutoCardsNetCard[] {
  const fromJson = readNarutoCardsNetLedgerJson(packDir);
  if (fromJson.length > 0) return fromJson;
  const fromSitemap = parseNarutoCardsNetLedgerFromStaging(packDir);
  if (fromSitemap.length > 0) syncNarutoCardsNetLedger(packDir, fromSitemap);
  return fromSitemap;
}

function syncNarutoCardsNetLedger(
  packDir: string | undefined,
  cards: readonly NarutoCardsNetCard[],
): void {
  const root = packDir ?? packRoot();
  mkdirSync(path.join(root, NARUTO_STAGING_NARUTOCARDS_NET), {
    recursive: true,
  });
  writeFileSync(
    narutoCardsNetLedgerPath(root),
    `${JSON.stringify(
      {
        source: hinokunianJp.sitemap,
        generatedAt: new Date().toISOString(),
        ingest: "titles-slug-derived",
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export function mergeNarutoCardsNetLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergeNarutoCardsNetIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadNarutoCardsNetLedger(input.packDir),
  });
}

export type ScrapeNarutoCardsNetOptions = {
  force?: boolean;
  root?: string;
};

export async function scrapeNarutoCardsNetTitles(
  opts: ScrapeNarutoCardsNetOptions = {},
): Promise<{ written: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = narutoCardsNetLedgerPath(packDir);
  const sitemapDest = narutoCardsNetSitemapPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadNarutoCardsNetLedger(packDir);
    if (existing.length) {
      console.log(
        `── narutocards.net titles : ${existing.length} déjà en staging`,
      );
      return { written: existing.length };
    }
  }

  const res = await httpGet<string>(hinokunianJp.sitemap, {
    headers: { "User-Agent": UA, Accept: "application/xml,text/xml" },
    responseType: "text",
    timeout: 45_000,
    validateStatus: (status) => status === 200,
  });
  const xml = typeof res.data === "string" ? res.data : "";
  if (xml.length < 400) {
    throw new Error("narutocards.net sitemap empty or unreachable");
  }
  const cards = parseNarutoCardsNetSitemap(xml);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(sitemapDest, xml, "utf8");
  syncNarutoCardsNetLedger(packDir, cards);
  console.log(`── narutocards.net titles : ${cards.length} écrits (slug-derived)`);
  return { written: cards.length };
}

// ─── scrapeNarutoCardGameGg ──────────────────────────────────────────────────────────

/**
 * Moisson de narutocardgame.gg → faces du CCG anglais.
 *
 * Une requête pour l'index — il tient les 4 452 cartes, set compris dans
 * l'URL — puis une par visuel. Les faces sont servies en **350×490**, bien
 * plus petites que ce que nous tenons déjà (jusqu'à 1414×2000) : elles ne
 * remplacent rien, mais elles couvrent ce qu'on n'a pas du tout, et le
 * classement par pixels les reléguera partout ailleurs.
 *
 * Les noms (slug URL → Title Case) ne sont fusionnés que pour combler un
 * trou EN : Goat / Bandai / etc. gardent la priorité.
 */
const cardGameGg_LANG = "en";

export const GG_STAGING = "narutocardgame-gg";

export function ggStagingDir(root?: string): string {
  return path.join(
    root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    GG_STAGING,
  );
}

export async function fetchGgCardIndex(): Promise<GgCard[]> {
  const response = await httpGet(ggArchiveIndexUrl("classic-ccg"), {
    headers: { "User-Agent": UA },
    timeout: 60_000,
  });
  const html = String((response as { data?: unknown }).data ?? "");
  return parseGgCardIndex(html, "classic-ccg");
}

/** `n` + 1 → `n0001`, la forme que le catalogue emploie. */
export function ggDiskNumber(card: GgCard): string {
  return `${card.prefix}${String(card.number).padStart(4, "0")}`;
}

export function writeGgIndex(cards: readonly GgCard[], root?: string): string {
  const dir = ggStagingDir(root);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cards.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        source: ggArchiveIndexUrl("classic-ccg"),
        observed: new Date().toISOString().slice(0, 10),
        cards: cards.length,
        rows: cards.map((card) => ({ ...card, number: ggDiskNumber(card) })),
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

/**
 * Rapatrie les visuels, un par carte.
 *
 * Quatre mille requêtes sur un seul hôte : la cadence reste basse, et une
 * carte déjà servie n'est pas redemandée. Les octets d'origine sont écrits tels
 * quels — le format est du JPEG et le réencoder ne ferait que perdre.
 */
export async function downloadGgFaces(input: {
  cards: readonly GgCard[];
  cardsDir: string;
  /** `n` → `ninja` : le dossier disque de la famille. */
  folderOf: (prefix: string) => string | null;
  force?: boolean;
  delayMs?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ written: number; skipped: number; failed: string[] }> {
  const delay = input.delayMs ?? 350;
  let written = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const [index, card] of input.cards.entries()) {
    const folder = input.folderOf(card.prefix);
    if (!folder) {
      failed.push(`${card.prefix}${card.number} (famille inconnue)`);
      continue;
    }
    const id = ggDiskNumber(card);
    const dir = path.join(input.cardsDir, folder, id, cardGameGg_LANG);
    if (!input.force && existingNarutoArtForSource(dir, "narutocardgamegg")) {
      skipped += 1;
      continue;
    }
    try {
      const response = await httpGet(ggClassicImageUrl(card), {
          headers: { "User-Agent": UA },
          responseType: "arraybuffer",
          timeout: 30_000,
        });
      const data = (response as { data?: ArrayBuffer }).data;
      if (!data) throw new Error("vide");
      const buf = Buffer.from(data);
      if (extFromMagic(buf) === ".bin") throw new Error("bin");
      const saved = await saveNarutoFace({
        cardDir: dir,
        buf,
        source: "narutocardgamegg",
        lang: cardGameGg_LANG,
        force: input.force,
      });
      if (saved === "skip") skipped += 1;
      else written += 1;
    } catch {
      failed.push(id);
    }
    if ((index + 1) % 200 === 0) {
      input.onProgress?.(index + 1, input.cards.length);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  return { written, skipped, failed };
}

export type GgClassicTitleRow = Omit<GgCard, "number"> & {
  /** Disk id already padded (`nc0001`) when loaded from staging. */
  number: string;
};

export function loadGgClassicTitleLedger(
  packDir?: string,
): GgClassicTitleRow[] {
  const file = path.join(
    packDir ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    GG_STAGING,
    "cards.json",
  );
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      rows?: Array<Partial<GgClassicTitleRow>>;
    };
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    return rows.filter((row): row is GgClassicTitleRow => {
      return (
        typeof row?.prefix === "string" &&
        typeof row?.slug === "string" &&
        typeof row?.number === "string" &&
        row.slug.trim().length > 0 &&
        row.number.trim().length > 0
      );
    });
  } catch {
    return [];
  }
}

/**
 * Fill EN titles from narutocardgame.gg slugs when the print already exists
 * and has no EN name. Never mints prints; never overwrites attested names.
 */
export function mergeGgClassicTitlesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
  cards?: readonly GgClassicTitleRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
} {
  const cards = input.cards ?? loadGgClassicTitleLedger(input.packDir);
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printKeys = new Set(
    prints.map((p) => p.printKey),
  );
  const titledEn = new Set(
    titles
      .filter((t) => t.lang.toLowerCase() === "en" && t.fullName.trim())
      .map((t) => t.printKey),
  );
  const titled: string[] = [];
  for (const row of cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey || !printKeys.has(printKey)) continue;
    if (titledEn.has(printKey)) continue;
    const name = ggCardName(row.slug).trim();
    if (!name) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: name,
      nameSource: "narutocardgamegg",
    });
    titledEn.add(printKey);
    titled.push(printKey);
  }
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}

export type ScrapeNarutoCardGameGgOptions = {
  force?: boolean;
  delayMs?: number;
  limit?: number;
  packRoot?: string;
};

/** Index + download → `art.narutocardgamegg.*` under EN card folders. */
export async function scrapeNarutoCardGameGgCards(
  options: ScrapeNarutoCardGameGgOptions = {},
): Promise<{ written: number; skipped: number; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cards = await fetchGgCardIndex();
  writeGgIndex(cards, packRoot);
  const slice =
    typeof options.limit === "number" && options.limit > 0
      ? cards.slice(0, options.limit)
      : cards;
  console.log(
    `── narutocardgame.gg : ${slice.length}/${cards.length} faces EN → art.narutocardgamegg.*`,
  );
  const result = await downloadGgFaces({
    cards: slice,
    cardsDir: path.join(packRoot, "cards"),
    folderOf: (prefix) => narutoFamilyForPrefix(prefix),
    force: options.force,
    delayMs: options.delayMs,
    onProgress: (done, total) => {
      if (done % 200 === 0 || done === total) {
        console.log(`── narutocardgame.gg : ${done}/${total}`);
      }
    },
  });
  console.log(
    JSON.stringify({
      narutocardgamegg: true,
      written: result.written,
      skipped: result.skipped,
      failed: result.failed.length,
    }),
  );
  return result;
}

// ─── scrapeNarutoZabuza ──────────────────────────────────────────────────────────

/**
 * One attested JP promo scan: PR忍-1-R from narutozabuza.centerblog.net.
 * Do not crawl the rest of the blog.
 */
const narutoZabuza_MIN_BYTES = 3_000;
const narutoZabuza_LANG = "ja";

export type ScrapeNarutoZabuzaOptions = {
  force?: boolean;
  root?: string;
};

async function narutoZabuza_downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
        Referer: zabuza.url,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= narutoZabuza_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeNarutoZabuzaPromo(
  opts: ScrapeNarutoZabuzaOptions = {},
): Promise<{ downloaded: number; skipped: number; failed: number }> {
  const diskId = narutoDiskCardId(zabuza.print.printedRef);
  if (!diskId) {
    console.warn("── JA zabuza : PR忍-1-R ne parse pas");
    return { downloaded: 0, skipped: 0, failed: 1 };
  }
  const cardsDir = path.join(packRoot(opts.root), "cards");
  const cardDir =
    narutoCardAbsDir(cardsDir, diskId, narutoZabuza_LANG) ??
    path.join(cardsDir, "promo", diskId, narutoZabuza_LANG);
  if (!opts.force && existingNarutoArtForSource(cardDir, "zabuza")) {
    console.log(`── JA zabuza ${diskId} déjà là (zabuza)`);
    return { downloaded: 0, skipped: 1, failed: 0 };
  }
  console.log(`── JA zabuza PR忍-1-R → ${diskId}/ja/art.zabuza.*`);
  const buf = await narutoZabuza_downloadBytes(zabuza.image.url);
  if (!buf) {
    console.log(`JA zabuza ${diskId} FAIL`);
    return { downloaded: 0, skipped: 0, failed: 1 };
  }
  const saved = await saveNarutoFace({
    cardDir,
    buf,
    source: "zabuza",
    lang: narutoZabuza_LANG,
    force: opts.force,
  });
  return saved === "skip"
    ? { downloaded: 0, skipped: 1, failed: 0 }
    : { downloaded: 1, skipped: 0, failed: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeNarutoZabuzaPromo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
