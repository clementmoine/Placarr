/**
 * Moisson Coleka Ultra Challenge via FlareSolverr (listing EN).
 *
 * Photos collectionneur (~995×1393) → `art.coleka.webp`. Préférées aux
 * thumbs AnimeCollection h400 quand les deux existent.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { DatabaseSync } from "node:sqlite";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packCatalogDb, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { fetchColekaListingHtml } from "@/providers/narutocarddass/sources/colekaListingFetch";

import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";
import { NARUTO_ULTRA_SET_CODE, ultraChallengePrintKey } from "./printKey";
import {
  COLEKA_ULTRA_LANG,
  COLEKA_ULTRA_LISTING_PATH,
  COLEKA_ULTRA_ORIGIN,
  colekaUltraListingPageUrls,
  parseColekaUltraListing,
  type ColekaUltraCard,
} from "./parseColekaUltra";

const STAGING_FOLDER = "coleka-ultra-faces";
const LEDGER_FILE = "coleka-ultra-faces.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const REFERER = `${COLEKA_ULTRA_ORIGIN}${COLEKA_ULTRA_LISTING_PATH}`;

export type ColekaUltraFacesLedger = {
  source: string;
  url: string;
  sourceId: string;
  lang: string;
  listingPath: string;
};

export function colekaUltraFacesLedgerPath(): string {
  return path.join(narutoUltraCuratedDir(), "sources", LEDGER_FILE);
}

export function readColekaUltraFacesLedger(): ColekaUltraFacesLedger {
  return JSON.parse(
    readFileSync(colekaUltraFacesLedgerPath(), "utf8"),
  ) as ColekaUltraFacesLedger;
}

export function colekaUltraFacesStagingDir(): string {
  return path.join(packStagingDir(NARUTO_ULTRA_PACK_ID), STAGING_FOLDER);
}

export function colekaUltraStagingFile(card: ColekaUltraCard): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${card.number}${ext || ".webp"}`;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: REFERER },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 500) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

export type ColekaUltraHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  rejected: { ref: string; name: string; reason: string }[];
};

export async function harvestColekaUltraFaces(
  opts: { force?: boolean; stagingDir?: string } = {},
): Promise<ColekaUltraHarvest> {
  const staging = opts.stagingDir ?? colekaUltraFacesStagingDir();
  mkdirSync(staging, { recursive: true });
  const seen = new Map<string, ColekaUltraCard>();
  const rejected: ColekaUltraHarvest["rejected"] = [];
  let pages = 0;

  for (const [i, url] of colekaUltraListingPageUrls().entries()) {
    const dest = path.join(staging, `listing-${i}.html`);
    const html = await fetchColekaListingHtml(url, dest, Boolean(opts.force));
    if (!html) continue;
    pages += 1;
    const parsed = parseColekaUltraListing(html);
    for (const card of parsed.cards) {
      if (!seen.has(card.number)) seen.set(card.number, card);
    }
    rejected.push(...parsed.rejected);
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const card of seen.values()) {
    const dest = path.join(staging, colekaUltraStagingFile(card));
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(card.faceUrl);
    if (!buf) {
      fail += 1;
    } else {
      writeFileSync(dest, buf);
      ok += 1;
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    pages,
    cards: seen.size,
    ok,
    skip,
    fail,
    rejected,
  };
}

export type ColekaUltraInstall = {
  faces: number;
  missing: string[];
  /** Gabarits dont `art.coleka` a été retiré de l'index (dump conservé). */
  purgedPlaceholders: string[];
};

/** Retire `art.coleka*` des gabarits — le dump reste à côté, comme Ninja Ranks. */
function purgeColekaUltraPlaceholders(
  index: LocalPrintsIndex,
  lang: string,
  numbers: readonly string[],
): string[] {
  if (!numbers.length) return [];
  const dbPath = packCatalogDb(NARUTO_ULTRA_PACK_ID);
  if (!existsSync(dbPath)) return [];
  const purged: string[] = [];
  const db = new DatabaseSync(dbPath);
  try {
    const stmt = db.prepare(
      `UPDATE print_assets
       SET art = NULL
       WHERE print_key = ? AND lang = ? AND art LIKE 'art.coleka%'`,
    );
    for (const number of numbers) {
      const printKey = ultraChallengePrintKey(number);
      if (!printKey) continue;
      stmt.run(printKey, lang);
      purged.push(number);
    }
  } finally {
    db.close();
  }
  index.exportIndex();
  return purged;
}

export function installColekaUltraFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ColekaUltraInstall {
  const ledger = readColekaUltraFacesLedger();
  const staging = opts.stagingDir ?? colekaUltraFacesStagingDir();
  const lang = ledger.lang?.trim().toLowerCase() || COLEKA_ULTRA_LANG;
  const missing: string[] = [];
  const placeholderNumbers: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[] = [];

  if (!existsSync(staging)) {
    return { faces: 0, missing, purgedPlaceholders: [] };
  }

  for (const [i] of colekaUltraListingPageUrls().entries()) {
    const listing = path.join(staging, `listing-${i}.html`);
    if (!existsSync(listing)) continue;
    const parsed = parseColekaUltraListing(readFileSync(listing, "utf8"));
    for (const row of parsed.rejected) {
      if (!/gabarit/i.test(row.reason)) continue;
      const number = String(Number.parseInt(row.ref, 10)).padStart(4, "0");
      if (Number.parseInt(number, 10) >= 1) placeholderNumbers.push(number);
    }
    for (const card of parsed.cards) {
      const src = path.join(staging, colekaUltraStagingFile(card));
      if (!existsSync(src)) {
        missing.push(card.number);
        continue;
      }
      const printKey = ultraChallengePrintKey(card.number);
      if (!printKey) {
        missing.push(card.number);
        continue;
      }
      const destDir = path.join(
        packCardsDir(NARUTO_ULTRA_PACK_ID),
        NARUTO_ULTRA_SET_CODE,
        lang,
        card.number,
      );
      mkdirSync(destDir, { recursive: true });
      const ext = path.extname(src).toLowerCase() || ".webp";
      const art = `art.${ledger.sourceId}${ext}`;
      copyFileSync(src, path.join(destDir, art));
      assets.push({
        printKey,
        lang,
        art,
        sourceUrl: card.faceUrl,
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  const purgedPlaceholders = purgeColekaUltraPlaceholders(
    index,
    lang,
    [...new Set(placeholderNumbers)],
  );
  return { faces: assets.length, missing, purgedPlaceholders };
}
