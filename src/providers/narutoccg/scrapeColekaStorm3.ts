/**
 * Install Coleka FR scans for Series 28 into `cards/s28/fr/{n1650}/art.coleka.*`.
 *
 * Listing HTML comes from Coleka `_r16649` only (not the 7000-card umbrella).
 * Faces are pulled from `thumbs.coleka.com` — that CDN is not behind the
 * HTML verify wall. Listing pages 2–3 used to stop on the wall; FlareSolverr
 * retries them.
 *
 * Staging: `data/naruto/carddass/staging/coleka-s28/`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { fetchColekaListingHtml } from "./colekaListingFetch";
import { NARUTO_PACK_ID } from "./packs";
import { narutoCardAbsDir } from "./narutoCardDisk";
import { upsertNarutoAppearances } from "./migrateCardLayout";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import { installColekaEnCcgCovers } from "./installColekaEnCovers";
import {
  COLEKA_ORIGIN,
  COLEKA_STORM3_LANG,
  COLEKA_STORM3_LISTING_PATH,
  COLEKA_STORM3_SET_COVER_URL,
  colekaStorm3ListingPageUrls,
  parseColekaStorm3Listing,
  STORM3_SET,
  type ColekaStorm3Card,
} from "./parseColekaStorm3";

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

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

function stagingDir(packDir: string): string {
  return path.join(packDir, NARUTO_STAGING_COLEKA_S28);
}

export function colekaStorm3LedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLEKA_S28,
    "cards.json",
  );
}

export function loadColekaStorm3Ledger(packDir?: string): ColekaStorm3Card[] {
  const file = colekaStorm3LedgerPath(packDir);
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

async function writeSetCover(
  packDir: string,
  staging: string,
): Promise<boolean> {
  const buf = await downloadBytes(COLEKA_STORM3_SET_COVER_URL, 4_000);
  if (!buf) return false;
  const ext = extFromMagic(buf);
  if (ext !== ".webp" && ext !== ".jpg" && ext !== ".png") return false;
  mkdirSync(staging, { recursive: true });
  writeFileSync(path.join(staging, `set-cover${ext}`), buf);
  const products = path.join(packDir, "products");
  mkdirSync(products, { recursive: true });
  writeFileSync(path.join(products, `logo-s28${ext}`), buf);
  return true;
}

export async function scrapeNarutoColekaStorm3Cards(
  options: ScrapeColekaStorm3Options = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = stagingDir(root);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  console.log("── Storm 3 FR (Coleka s28) → cards/{family}/{n|j|m}####/fr/");
  const byNumber = new Map<string, ColekaStorm3Card>();
  let pageIdx = 0;
  let waited = false;
  for (const url of colekaStorm3ListingPageUrls()) {
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
        `── Storm 3 FR : listing page ${pageIdx} absente ou mur Coleka, on continue`,
      );
      continue;
    }
    mergeByNumber(byNumber, parseColekaStorm3Listing(html));
  }

  let cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  console.log(`── Storm 3 FR listing : ${cards.length} singles`);

  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${COLEKA_ORIGIN}${COLEKA_STORM3_LISTING_PATH}`,
        set: STORM3_SET,
        lang: COLEKA_STORM3_LANG,
        capturedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const coverOk = await writeSetCover(root, staging);
  console.log(`── Storm 3 FR cover : ${coverOk ? "ok" : "manquante"}`);

  if (options.cdxOnly) return;

  let ok = 0;
  let skip = 0;
  let fail = 0;
  waited = false;
  for (const card of cards) {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, COLEKA_STORM3_LANG) ??
      path.join(cardsDir, STORM3_SET, COLEKA_STORM3_LANG, card.number);
    if (!force && existingNarutoArtForSource(cardDir, "coleka")) {
      skip += 1;
      upsertNarutoAppearances(root, [
        {
          diskId: card.number,
          lang: COLEKA_STORM3_LANG,
          appearanceSet: STORM3_SET,
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
      console.log(`Storm 3 FR ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`Storm 3 FR ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "coleka",
      lang: COLEKA_STORM3_LANG,
      force,
    });
    upsertNarutoAppearances(root, [
      {
        diskId: card.number,
        lang: COLEKA_STORM3_LANG,
        appearanceSet: STORM3_SET,
      },
    ]);
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      storm3Coleka: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );

  const covers = await installColekaEnCcgCovers({
    packRoot: root,
    force,
  });
  console.log(
    `── Coleka EN CCG displays : ${covers.written.length} écrits, ${covers.skipped.length} sautés`,
  );
}
