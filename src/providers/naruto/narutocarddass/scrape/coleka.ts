/**
 * Naruto Carddass coleka scrapers.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import { fetchColekaListingHtml } from "../sources/faces";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { narutoCardAbsDir } from "../disk";
import { existingNarutoArtForSource, extFromMagic, saveNarutoFace } from "../disk";
import {
  COLEKA_CARDDASS_FR_LANG,
  COLEKA_CARDDASS_FR_SERIES,
  colekaCarddassFrListingPageUrls,
  colekaCarddassFrParentUrl,
  parseColekaCarddassFrListing,
  type ColekaCarddassFrCard,
  COLEKA_ORIGIN,
  COLEKA_S6_IT_LANG,
  COLEKA_S6_IT_LISTING_PATH,
  COLEKA_S6_IT_SET,
  colekaS6ItListingPageUrls,
  parseColekaS6ItListing,
  type ColekaS6ItCard,
  COLEKA_CCG_FR_LANG,
  COLEKA_SAGES_LEGACY_LISTING_PATH,
  COLEKA_SAGES_LEGACY_SET_COVER_URL,
  COLEKA_STORM3_LISTING_PATH,
  COLEKA_STORM3_SET_COVER_URL,
  COLEKA_RAMPAGE_TORNADO_LISTING_PATH,
  COLEKA_RAMPAGE_TORNADO_SET_COVER_URL,
  colekaSagesLegacyListingPageUrls,
  colekaStorm3ListingPageUrls,
  colekaRampageTornadoListingPageUrls,
  parseColekaStorm3Listing,
  parseColekaRampageTornadoListing,
  RAMPAGE_TORNADO_SET,
  SAGES_LEGACY_SET,
  STORM3_SET,
  type ColekaStorm3Card,
} from "../parse/coleka";
import { mintNarutoPrintKey, narutoDiskCardId, narutoNumbersEqual } from "../identity";
import { upsertNarutoAppearances } from "../pipeline";
import { cardTypeFromCollectorNumber } from "../parse/bandai";
import { NARUTO_PACK_ID } from "../identity";
import { installColekaEnCcgCovers } from "../install/faces";

// ─── shared helpers ─────────────────────────────────────────────────────

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const DEFAULT_DELAY_MS = 400;

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

// ─── scrapeColekaCarddassFr ──────────────────────────────────────────────────────────

/**
 * Install Coleka FR Carddass S1–S5 scans as `art.coleka.*` next to
 * `art.carddass`. Listing HTML from series leaves `_r4108`…`_r4112` only
 * (not parent `_r41705`, not umbrella `_r4102`). Faces from
 * `thumbs.coleka.com`.
 *
 * Staging: `data/naruto/carddass/staging/coleka-carddass-fr/`.
 */
export const NARUTO_STAGING_COLEKA_CARDDASS_FR = path.join(
  "staging",
  "coleka-carddass-fr",
);

export type ScrapeColekaCarddassFrOptions = {
  force?: boolean;
  limit?: number;
  cdxOnly?: boolean;
  delayMs?: number;
  root?: string;
};

function colekaCarddassFr_stagingDir(packDir: string): string {
  return path.join(packDir, NARUTO_STAGING_COLEKA_CARDDASS_FR);
}

export function colekaCarddassFrLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLEKA_CARDDASS_FR,
    "cards.json",
  );
}

export function loadColekaCarddassFrLedger(
  packDir?: string,
): ColekaCarddassFrCard[] {
  const file = colekaCarddassFrLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is ColekaCarddassFrCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as ColekaCarddassFrCard;
      return (
        typeof card.number === "string" &&
        typeof card.colekaRef === "string" &&
        typeof card.set === "string" &&
        (card.name === null || typeof card.name === "string")
      );
    });
  } catch {
    return [];
  }
}

async function colekaCarddassFr_downloadBytes(
  url: string,
  minBytes: number,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: `${COLEKA_ORIGIN}/`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    const ext = extFromMagic(buf);
    if (/\.webp(?:\?|$)/i.test(url) && ext !== ".webp") return null;
    return buf.byteLength >= minBytes ? buf : null;
  } catch {
    return null;
  }
}

function colekaCarddassFr_mergeByNumber(
  into: Map<string, ColekaCarddassFrCard>,
  cards: ColekaCarddassFrCard[],
): void {
  for (const card of cards) {
    if (!into.has(card.number)) into.set(card.number, card);
  }
}

export async function scrapeNarutoColekaCarddassFrCards(
  options: ScrapeColekaCarddassFrOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = colekaCarddassFr_stagingDir(root);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log("── Coleka FR Carddass S1–S5 → art.coleka");
  const byNumber = new Map<string, ColekaCarddassFrCard>();
  let waited = false;

  for (const series of COLEKA_CARDDASS_FR_SERIES) {
    let pageIdx = 0;
    for (const url of colekaCarddassFrListingPageUrls(
      series.path,
      series.listedCount,
    )) {
      if (delayMs > 0) {
        if (waited) await sleep(delayMs);
        else waited = true;
      }
      const html = await fetchColekaListingHtml(
        url,
        path.join(staging, `${series.set}-listing-${pageIdx}.html`),
        force,
      );
      pageIdx += 1;
      if (!html) {
        console.warn(
          `── Coleka FR ${series.set} : page ${pageIdx} absente ou mur, on continue`,
        );
        continue;
      }
      const parsed = parseColekaCarddassFrListing(html, series.set);
      if (parsed.length === 0) break;
      colekaCarddassFr_mergeByNumber(byNumber, parsed);
    }
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  const named = cards.filter((c) => c.name).length;
  const withFace = cards.filter((c) => c.faceUrl).length;
  console.log(
    `── Coleka FR listing : ${cards.length} singles (${named} nommées, ${withFace} photos)`,
  );

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: colekaCarddassFrParentUrl(),
        lang: COLEKA_CARDDASS_FR_LANG,
        capturedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (options.cdxOnly) return;

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let noFace = 0;
  waited = false;
  for (const card of cards) {
    if (!card.faceUrl) {
      noFace += 1;
      continue;
    }
    const cardDir = narutoCardAbsDir(
      cardsDir,
      card.number,
      COLEKA_CARDDASS_FR_LANG,
    );
    if (!cardDir) {
      fail += 1;
      continue;
    }
    if (!force && existingNarutoArtForSource(cardDir, "coleka")) {
      skip += 1;
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const buf = await colekaCarddassFr_downloadBytes(card.faceUrl, 8_000);
    if (!buf) {
      fail += 1;
      console.log(`Coleka FR ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`Coleka FR ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "coleka",
      lang: COLEKA_CARDDASS_FR_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      colekaCarddassFr: true,
      listed: cards.length,
      named,
      downloaded: ok,
      skipped: skip,
      failed: fail,
      noFace,
    }),
  );
}

// ─── scrapeColekaS6It ──────────────────────────────────────────────────────────

/**
 * Install Italian CACG Series 6 (Rivalità Eterna) into `cards/s6/it/`.
 *
 * Listing: Coleka `_r41388` only. Faces from `thumbs.coleka.com` (not the
 * HTML verify wall). Nameless / photoless rows stay in the ledger so the
 * index can list them honestly. FR pre-prod under `cards/s6/fr/` is untouched.
 */
export const NARUTO_STAGING_COLEKA_S6_IT = path.join("staging", "coleka-s6-it");

export type ScrapeColekaS6ItOptions = {
  force?: boolean;
  limit?: number;
  cdxOnly?: boolean;
  delayMs?: number;
  root?: string;
};

function s6It_stagingDir(packDir: string): string {
  return path.join(packDir, NARUTO_STAGING_COLEKA_S6_IT);
}

export function colekaS6ItLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLEKA_S6_IT,
    "cards.json",
  );
}

export function loadColekaS6ItLedger(packDir?: string): ColekaS6ItCard[] {
  const file = colekaS6ItLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is ColekaS6ItCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as ColekaS6ItCard;
      return (
        typeof card.number === "string" &&
        typeof card.colekaRef === "string" &&
        (card.name === null || typeof card.name === "string")
      );
    });
  } catch {
    return [];
  }
}

async function s6It_downloadBytes(
  url: string,
  minBytes: number,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: `${COLEKA_ORIGIN}/`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    const ext = extFromMagic(buf);
    if (/\.webp(?:\?|$)/i.test(url) && ext !== ".webp") return null;
    return buf.byteLength >= minBytes ? buf : null;
  } catch {
    return null;
  }
}

function s6It_mergeByNumber(
  into: Map<string, ColekaS6ItCard>,
  cards: ColekaS6ItCard[],
): void {
  for (const card of cards) {
    if (!into.has(card.number)) into.set(card.number, card);
  }
}

/**
 * Add s6 prints + Italian titles from the Coleka ledger.
 * Does not invent FR names or overwrite `cards/s6/fr/`.
 */
export function mergeColekaS6ItIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  root: string;
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const cards = loadColekaS6ItLedger(input.root);
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const titleKeys = new Set(
    titles.map((t) => `${t.printKey}\0${t.lang.toLowerCase()}`),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const card of cards) {
    const existing = prints.find((p) =>
      narutoNumbersEqual(p.number, card.number),
    );
    const printKey = existing?.printKey ?? mintNarutoPrintKey(card.number);
    if (!printKey) continue;
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: COLEKA_S6_IT_SET,
        number: narutoDiskCardId(card.number) ?? card.number,
        cardType: cardTypeFromCollectorNumber(card.number),
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    if (!card.name) continue;
    const key = `${printKey}\0${COLEKA_S6_IT_LANG}`;
    if (titleKeys.has(key)) continue;
    titles.push({
      printKey,
      lang: COLEKA_S6_IT_LANG,
      fullName: card.name,
      rarity: null,
    });
    titleKeys.add(key);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}

export async function scrapeNarutoColekaS6ItCards(
  options: ScrapeColekaS6ItOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = s6It_stagingDir(root);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log("── S6 IT (Coleka Rivalità Eterna) → cards/s6/it/");
  const byNumber = new Map<string, ColekaS6ItCard>();
  let pageIdx = 0;
  let waited = false;
  for (const url of colekaS6ItListingPageUrls()) {
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const html = await fetchColekaListingHtml(
      url,
      path.join(staging, `listing-${pageIdx}.html`),
      force,
    );
    pageIdx += 1;
    if (!html) {
      console.warn(
        `── S6 IT : listing page ${pageIdx} absente ou mur Coleka, on continue`,
      );
      continue;
    }
    s6It_mergeByNumber(byNumber, parseColekaS6ItListing(html));
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  const named = cards.filter((c) => c.name).length;
  const withFace = cards.filter((c) => c.faceUrl).length;
  console.log(
    `── S6 IT listing : ${cards.length} singles (${named} nommées, ${withFace} photos)`,
  );

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${COLEKA_ORIGIN}${COLEKA_S6_IT_LISTING_PATH}`,
        set: COLEKA_S6_IT_SET,
        lang: COLEKA_S6_IT_LANG,
        capturedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (options.cdxOnly) return;

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let noFace = 0;
  waited = false;
  for (const card of cards) {
    if (!card.faceUrl) {
      noFace += 1;
      continue;
    }
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, COLEKA_S6_IT_LANG) ??
      path.join(cardsDir, COLEKA_S6_IT_SET, COLEKA_S6_IT_LANG, card.number);
    if (!force && existingNarutoArtForSource(cardDir, "coleka")) {
      skip += 1;
      upsertNarutoAppearances(root, [
        {
          diskId: narutoDiskCardId(card.number) ?? card.number,
          lang: COLEKA_S6_IT_LANG,
          appearanceSet: COLEKA_S6_IT_SET,
        },
      ]);
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const buf = await s6It_downloadBytes(card.faceUrl, 8_000);
    if (!buf) {
      fail += 1;
      console.log(`S6 IT ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`S6 IT ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "coleka",
      lang: COLEKA_S6_IT_LANG,
      force,
    });
    upsertNarutoAppearances(root, [
      {
        diskId: narutoDiskCardId(card.number) ?? card.number,
        lang: COLEKA_S6_IT_LANG,
        appearanceSet: COLEKA_S6_IT_SET,
      },
    ]);
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      colekaS6It: true,
      listed: cards.length,
      named,
      downloaded: ok,
      skipped: skip,
      failed: fail,
      noFace,
    }),
  );
}

// ─── scrapeColekaStorm3 ──────────────────────────────────────────────────────────

/**
 * Install Coleka FR scans for Bandai USA CCG late series:
 * Sage's Legacy (`s24`) and Ultimate Ninja Storm 3 (`s28`).
 *
 * Listing HTML comes from the série branch only (not the 7000-card umbrella).
 * Faces are pulled from `thumbs.coleka.com` — that CDN is not behind the
 * HTML verify wall. Listing pages 2–3 used to stop on the wall; FlareSolverr
 * retries them.
 *
 * Staging: `data/naruto/carddass/staging/coleka-s24/` and `coleka-s28/`.
 */
export const NARUTO_STAGING_COLEKA_S24 = path.join("staging", "coleka-s24");
export const NARUTO_STAGING_COLEKA_S28 = path.join("staging", "coleka-s28");
export const NARUTO_STAGING_COLEKA_RAMPAGE = path.join(
  "staging",
  "coleka-rampage-tornado",
);

export type ScrapeColekaStorm3Options = {
  force?: boolean;
  limit?: number;
  cdxOnly?: boolean;
  delayMs?: number;
  root?: string;
};

type ColekaCcgFrScrapeSpec = {
  set: string;
  listingPath: string;
  listingPageUrls: () => string[];
  stagingRel: string;
  coverUrl: string;
  /** Filename stem under `products/` (`logo-s28`). Omit to skip SKU write. */
  productLogo?: string;
  label: string;
  jsonKey: string;
  parseListing?: (html: string) => ColekaStorm3Card[];
};

function ledgerPath(packDir: string | undefined, stagingRel: string): string {
  return path.join(packDir ?? packRoot(), stagingRel, "cards.json");
}

function readColekaCcgFrLedger(
  packDir: string | undefined,
  stagingRel: string,
): ColekaStorm3Card[] {
  const file = ledgerPath(packDir, stagingRel);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter(
      (row): row is ColekaStorm3Card =>
        !!row &&
        typeof row === "object" &&
        typeof (row as ColekaStorm3Card).number === "string" &&
        typeof (row as ColekaStorm3Card).name === "string" &&
        typeof (row as ColekaStorm3Card).faceUrl === "string",
    );
  } catch {
    return [];
  }
}

export function colekaSagesLegacyLedgerPath(packDir?: string): string {
  return ledgerPath(packDir, NARUTO_STAGING_COLEKA_S24);
}

export function colekaStorm3LedgerPath(packDir?: string): string {
  return ledgerPath(packDir, NARUTO_STAGING_COLEKA_S28);
}

export function loadColekaSagesLegacyLedger(
  packDir?: string,
): ColekaStorm3Card[] {
  return readColekaCcgFrLedger(packDir, NARUTO_STAGING_COLEKA_S24);
}

export function loadColekaStorm3Ledger(
  packDir?: string,
): ColekaStorm3Card[] {
  return readColekaCcgFrLedger(packDir, NARUTO_STAGING_COLEKA_S28);
}

export function loadColekaRampageTornadoLedger(
  packDir?: string,
): ColekaStorm3Card[] {
  return readColekaCcgFrLedger(packDir, NARUTO_STAGING_COLEKA_RAMPAGE);
}

/** FR CCG titles from Coleka s24 + s28 + Rampage Tornado, unique by collector. */
export function loadColekaCcgFrLedgers(packDir?: string): ColekaStorm3Card[] {
  const seen = new Set<string>();
  const out: ColekaStorm3Card[] = [];
  for (const card of [
    ...loadColekaSagesLegacyLedger(packDir),
    ...loadColekaStorm3Ledger(packDir),
    ...loadColekaRampageTornadoLedger(packDir),
  ]) {
    if (seen.has(card.number)) continue;
    seen.add(card.number);
    out.push(card);
  }
  return out;
}

async function colekaStorm3_downloadBytes(
  url: string,
  minBytes: number,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: `${COLEKA_ORIGIN}/`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    const ext = extFromMagic(buf);
    // Coleka serves a JPEG placeholder for unknown CDN paths.
    if (/\.webp(?:\?|$)/i.test(url) && ext !== ".webp") return null;
    return buf.byteLength >= minBytes ? buf : null;
  } catch {
    return null;
  }
}

function colekaStorm3_mergeByNumber(
  into: Map<string, ColekaStorm3Card>,
  cards: ColekaStorm3Card[],
): void {
  for (const card of cards) {
    if (!into.has(card.number)) into.set(card.number, card);
  }
}

function appearanceDiskId(number: string): string {
  return narutoDiskCardId(number) ?? number;
}

async function writeSetCover(
  packDir: string,
  staging: string,
  coverUrl: string,
  productLogo?: string,
): Promise<boolean> {
  const buf = await colekaStorm3_downloadBytes(coverUrl, 4_000);
  if (!buf) return false;
  const ext = extFromMagic(buf);
  if (ext !== ".webp" && ext !== ".jpg" && ext !== ".png") return false;
  mkdirSync(staging, { recursive: true });
  writeFileSync(path.join(staging, `set-cover${ext}`), buf);
  if (productLogo) {
    const products = path.join(packDir, "products");
    mkdirSync(products, { recursive: true });
    writeFileSync(path.join(products, `${productLogo}${ext}`), buf);
  }
  return true;
}

async function scrapeColekaCcgFrSet(
  spec: ColekaCcgFrScrapeSpec,
  options: ScrapeColekaStorm3Options,
): Promise<void> {
  const root = packRoot(options.root);
  const staging = path.join(root, spec.stagingRel);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log(`── ${spec.label} → cards/{family}/{n|j|m}####/fr/`);
  const byNumber = new Map<string, ColekaStorm3Card>();
  let pageIdx = 0;
  let waited = false;
  for (const url of spec.listingPageUrls()) {
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const html = await fetchColekaListingHtml(
      url,
      path.join(staging, `listing-${pageIdx}.html`),
      force,
    );
    pageIdx += 1;
    if (!html) {
      console.warn(
        `── ${spec.label} : listing page ${pageIdx} absente ou mur Coleka, on continue`,
      );
      continue;
    }
    const parse = spec.parseListing ?? parseColekaStorm3Listing;
    colekaStorm3_mergeByNumber(byNumber, parse(html));
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  console.log(`── ${spec.label} listing : ${cards.length} singles`);

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${COLEKA_ORIGIN}${spec.listingPath}`,
        set: spec.set,
        lang: COLEKA_CCG_FR_LANG,
        capturedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const coverOk = await writeSetCover(
    root,
    staging,
    spec.coverUrl,
    spec.productLogo,
  );
  console.log(`── ${spec.label} cover : ${coverOk ? "ok" : "manquante"}`);

  if (options.cdxOnly) return;

  let ok = 0;
  let skip = 0;
  let fail = 0;
  waited = false;
  for (const card of cards) {
    const diskId = appearanceDiskId(card.number);
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, COLEKA_CCG_FR_LANG) ??
      path.join(cardsDir, spec.set, COLEKA_CCG_FR_LANG, diskId);
    if (!force && existingNarutoArtForSource(cardDir, "coleka")) {
      skip += 1;
      upsertNarutoAppearances(root, [
        {
          diskId,
          lang: COLEKA_CCG_FR_LANG,
          appearanceSet: spec.set,
        },
      ]);
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const buf = await colekaStorm3_downloadBytes(card.faceUrl, 8_000);
    if (!buf) {
      fail += 1;
      console.log(`${spec.label} ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`${spec.label} ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "coleka",
      lang: COLEKA_CCG_FR_LANG,
      force,
    });
    upsertNarutoAppearances(root, [
      {
        diskId,
        lang: COLEKA_CCG_FR_LANG,
        appearanceSet: spec.set,
      },
    ]);
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      [spec.jsonKey]: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
}

const SAGES_LEGACY_SPEC: ColekaCcgFrScrapeSpec = {
  set: SAGES_LEGACY_SET,
  listingPath: COLEKA_SAGES_LEGACY_LISTING_PATH,
  listingPageUrls: colekaSagesLegacyListingPageUrls,
  stagingRel: NARUTO_STAGING_COLEKA_S24,
  coverUrl: COLEKA_SAGES_LEGACY_SET_COVER_URL,
  label: "Sage's Legacy FR (Coleka s24)",
  jsonKey: "sagesLegacyColeka",
};

const STORM3_SPEC: ColekaCcgFrScrapeSpec = {
  set: STORM3_SET,
  listingPath: COLEKA_STORM3_LISTING_PATH,
  listingPageUrls: colekaStorm3ListingPageUrls,
  stagingRel: NARUTO_STAGING_COLEKA_S28,
  coverUrl: COLEKA_STORM3_SET_COVER_URL,
  productLogo: "logo-s28",
  label: "Storm 3 FR (Coleka s28)",
  jsonKey: "storm3Coleka",
};

const RAMPAGE_TORNADO_SPEC: ColekaCcgFrScrapeSpec = {
  set: RAMPAGE_TORNADO_SET,
  listingPath: COLEKA_RAMPAGE_TORNADO_LISTING_PATH,
  listingPageUrls: colekaRampageTornadoListingPageUrls,
  stagingRel: NARUTO_STAGING_COLEKA_RAMPAGE,
  coverUrl: COLEKA_RAMPAGE_TORNADO_SET_COVER_URL,
  productLogo: "deck-la-tempete-approche",
  label: "La tempête approche FR (Coleka Rampage Tornado)",
  jsonKey: "rampageTornadoColeka",
  parseListing: parseColekaRampageTornadoListing,
};

export async function scrapeNarutoColekaSagesLegacyCards(
  options: ScrapeColekaStorm3Options = {},
): Promise<void> {
  await scrapeColekaCcgFrSet(SAGES_LEGACY_SPEC, options);
}

export async function scrapeNarutoColekaRampageTornadoCards(
  options: ScrapeColekaStorm3Options = {},
): Promise<void> {
  await scrapeColekaCcgFrSet(RAMPAGE_TORNADO_SPEC, options);
}

export async function scrapeNarutoColekaStorm3Cards(
  options: ScrapeColekaStorm3Options = {},
): Promise<void> {
  const root = packRoot(options.root);
  await scrapeColekaCcgFrSet(STORM3_SPEC, options);
  await scrapeColekaCcgFrSet(RAMPAGE_TORNADO_SPEC, options);
  const covers = await installColekaEnCcgCovers({
    packRoot: root,
    force: options.force === true,
  });
  console.log(
    `── Coleka EN CCG displays : ${covers.written.length} écrits, ${covers.skipped.length} sautés`,
  );
}
