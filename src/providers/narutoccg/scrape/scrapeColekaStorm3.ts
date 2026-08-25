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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "../collectorIdentity";
import { fetchColekaListingHtml } from "../colekaListingFetch";
import { NARUTO_PACK_ID } from "../packs";
import { narutoCardAbsDir } from "../narutoCardDisk";
import { upsertNarutoAppearances } from "../migrateCardLayout";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { installColekaEnCcgCovers } from "../install/installColekaEnCovers";
import {
  COLEKA_CCG_FR_LANG,
  COLEKA_ORIGIN,
  COLEKA_SAGES_LEGACY_LISTING_PATH,
  COLEKA_SAGES_LEGACY_SET_COVER_URL,
  COLEKA_STORM3_LISTING_PATH,
  COLEKA_STORM3_SET_COVER_URL,
  colekaSagesLegacyListingPageUrls,
  colekaStorm3ListingPageUrls,
  parseColekaStorm3Listing,
  SAGES_LEGACY_SET,
  STORM3_SET,
  type ColekaStorm3Card,
} from "../parse/parseColekaStorm3";

export const NARUTO_STAGING_COLEKA_S24 = path.join("staging", "coleka-s24");
export const NARUTO_STAGING_COLEKA_S28 = path.join("staging", "coleka-s28");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 400;

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
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

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

export function loadColekaStorm3Ledger(packDir?: string): ColekaStorm3Card[] {
  return readColekaCcgFrLedger(packDir, NARUTO_STAGING_COLEKA_S28);
}

/** FR CCG titles from Coleka s24 + s28, unique by collector number. */
export function loadColekaCcgFrLedgers(packDir?: string): ColekaStorm3Card[] {
  const seen = new Set<string>();
  const out: ColekaStorm3Card[] = [];
  for (const card of [
    ...loadColekaSagesLegacyLedger(packDir),
    ...loadColekaStorm3Ledger(packDir),
  ]) {
    if (seen.has(card.number)) continue;
    seen.add(card.number);
    out.push(card);
  }
  return out;
}

async function downloadBytes(
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

function mergeByNumber(
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
  const buf = await downloadBytes(coverUrl, 4_000);
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
    mergeByNumber(byNumber, parseColekaStorm3Listing(html));
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
    const buf = await downloadBytes(card.faceUrl, 8_000);
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

export async function scrapeNarutoColekaSagesLegacyCards(
  options: ScrapeColekaStorm3Options = {},
): Promise<void> {
  await scrapeColekaCcgFrSet(SAGES_LEGACY_SPEC, options);
}

export async function scrapeNarutoColekaStorm3Cards(
  options: ScrapeColekaStorm3Options = {},
): Promise<void> {
  const root = packRoot(options.root);
  await scrapeColekaCcgFrSet(STORM3_SPEC, options);
  const covers = await installColekaEnCcgCovers({
    packRoot: root,
    force: options.force === true,
  });
  console.log(
    `── Coleka EN CCG displays : ${covers.written.length} écrits, ${covers.skipped.length} sautés`,
  );
}
