/**
 * Moisson et pose des scans Coleka de Ninja Ranks.
 *
 * Deux temps, comme le reste du pack : `harvest` descend le listing puis les
 * faces dans le staging, `install` les copie sous `cards/nr/{numéro}/en/` et
 * les inscrit à l'index. Rien n'est deviné entre les deux — le parseur a déjà
 * refusé ce qu'il ne pouvait pas prouver, voir `parseColekaNinjaRanks`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { fetchColekaListingHtml } from "@/providers/narutoccg/colekaListingFetch";

import {
  COLEKA_NINJA_RANKS_LANG,
  COLEKA_NINJA_RANKS_SET,
  colekaNinjaRanksListingPageUrls,
  parseColekaNinjaRanksListing,
  type ColekaNinjaRanksCard,
} from "./parseColekaNinjaRanks";
import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

const STAGING_FOLDER = "coleka-ninja-ranks";
const LEDGER_FILE = "coleka-ninja-ranks.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const COLEKA_NINJA_RANKS_REFERER =
  "https://www.coleka.com/en/trading-cards/panini-cards/naruto-ninja-ranks_r25928";

export type ColekaNinjaRanksLedger = {
  source: string;
  url: string;
  lang: string;
  sourceId: string;
  notIngested: { what: string; reason: string }[];
};

export function colekaNinjaRanksLedgerPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readColekaNinjaRanksLedger(): ColekaNinjaRanksLedger {
  return JSON.parse(
    readFileSync(colekaNinjaRanksLedgerPath(), "utf8"),
  ) as ColekaNinjaRanksLedger;
}

export function colekaNinjaRanksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

/** `0007` → `0007.webp` dans le staging : le numéro, pas le slug Coleka. */
export function colekaNinjaRanksStagingFile(card: {
  number: string;
  faceUrl: string;
}): string {
  const ext = path.extname(new URL(card.faceUrl).pathname).toLowerCase();
  return `${card.number}${ext || ".webp"}`;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: COLEKA_NINJA_RANKS_REFERER },
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

export type ColekaNinjaRanksHarvest = {
  pages: number;
  cards: number;
  ok: number;
  skip: number;
  fail: number;
  rejected: { ref: number; name: string; reason: string }[];
};

export async function harvestColekaNinjaRanks(
  opts: { force?: boolean } = {},
): Promise<ColekaNinjaRanksHarvest> {
  const staging = colekaNinjaRanksStagingDir();
  mkdirSync(staging, { recursive: true });
  const seen = new Map<string, ColekaNinjaRanksCard>();
  const rejected: ColekaNinjaRanksHarvest["rejected"] = [];
  let pages = 0;

  for (const [i, url] of colekaNinjaRanksListingPageUrls().entries()) {
    const dest = path.join(staging, `listing-${i}.html`);
    const html = await fetchColekaListingHtml(url, dest, Boolean(opts.force));
    // Une page derrière le mur rend `null` : on s'arrête là plutôt que de
    // compter comme vide une page qu'on n'a pas lue.
    if (!html) continue;
    pages += 1;
    const parsed = parseColekaNinjaRanksListing(html);
    for (const card of parsed.cards) {
      if (!seen.has(card.number)) seen.set(card.number, card);
    }
    rejected.push(...parsed.rejected);
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const card of seen.values()) {
    const dest = path.join(staging, colekaNinjaRanksStagingFile(card));
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(card.faceUrl);
    if (!buf) {
      fail += 1;
      continue;
    }
    writeFileSync(dest, buf);
    ok += 1;
  }

  return { pages, cards: seen.size, ok, skip, fail, rejected };
}

export type ColekaNinjaRanksInstall = {
  faces: number;
  missing: string[];
};

export function installColekaNinjaRanks(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): ColekaNinjaRanksInstall {
  const staging = opts.stagingDir ?? colekaNinjaRanksStagingDir();
  const ledger = readColekaNinjaRanksLedger();
  const lang = ledger.lang.trim().toLowerCase();
  const missing: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];

  if (!existsSync(staging)) return { faces: 0, missing };

  for (const [i] of colekaNinjaRanksListingPageUrls().entries()) {
    const listing = path.join(staging, `listing-${i}.html`);
    if (!existsSync(listing)) continue;
    const parsed = parseColekaNinjaRanksListing(readFileSync(listing, "utf8"));
    for (const card of parsed.cards) {
      const src = path.join(staging, colekaNinjaRanksStagingFile(card));
      if (!existsSync(src)) {
        missing.push(card.number);
        continue;
      }
      const printKey = ninjaRanksPrintKey(COLEKA_NINJA_RANKS_SET, card.number);
      if (!printKey) {
        missing.push(card.number);
        continue;
      }
      const destDir = path.join(
        packCardsDir(NARUTO_RANKS_PACK_ID),
        COLEKA_NINJA_RANKS_SET,
        card.number,
        lang,
      );
      mkdirSync(destDir, { recursive: true });
      const ext = path.extname(src).toLowerCase() || ".webp";
      const art = `art.${ledger.sourceId}${ext}`;
      copyFileSync(src, path.join(destDir, art));
      if (!assets.some((a) => a.printKey === printKey)) {
        assets.push({ printKey, lang, art, sourceUrl: card.faceUrl });
      }
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, missing };
}

export { COLEKA_NINJA_RANKS_LANG };
