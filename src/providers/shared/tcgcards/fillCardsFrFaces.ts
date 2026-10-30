/**
 * Install FR shop faces from ygocards.fr / mtgcards.fr / opecards.fr list tiles.
 *
 * Catalogue prints stay seeded by YGOPRODeck / Scryfall / punk-records; this
 * only drops `art.<host>.webp` when the printKey already exists and the host
 * file is missing (unless `force`).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { packCardDir } from "@/lib/packPaths";
import {
  installCardFace,
  downloadCardFaceBytes,
} from "@/providers/shared/cardCatalogue/faceInstall";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  cardsFrShopPrintKey,
} from "@/providers/shared/tcgcards/cardsFrPrintRef";
import type { DbscardsIndexEntry } from "@/providers/shared/tcgcards/list";
import {
  MTGCARDS_CARD_SITE,
  OPECARDS_CARD_SITE,
  YGOCARDS_CARD_SITE,
  mtgcardsIndexPath,
  opecardsIndexPath,
  scrapeDbscardsIndex,
  ygocardsIndexPath,
} from "@/providers/shared/tcgcards/scrapeList";
import { tcgCardsSite } from "@/providers/shared/tcgcards/sites";

type CardsFrFaceHost = "ygocards" | "mtgcards" | "opecards";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function loadIndex(file: string): DbscardsIndexEntry[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(raw) ? (raw as DbscardsIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function existingHostArt(cardDir: string, host: string): string | null {
  if (!existsSync(cardDir)) return null;
  const re = new RegExp(`^art\\.${host}\\.`, "i");
  return readdirSync(cardDir).find((name) => re.test(name)) ?? null;
}

export type FillCardsFrFacesReport = {
  host: CardsFrFaceHost;
  indexCards: number;
  tried: number;
  written: number;
  skipped: number;
  unmapped: number;
  unknownPrint: number;
  failed: number;
  indexFile: string | null;
};

function cardsFrFaceIndexPath(host: CardsFrFaceHost): string {
  if (host === "ygocards") return ygocardsIndexPath("fr");
  if (host === "mtgcards") return mtgcardsIndexPath("fr");
  return opecardsIndexPath("fr");
}

function cardsFrFaceSite(host: CardsFrFaceHost) {
  if (host === "ygocards") return YGOCARDS_CARD_SITE;
  if (host === "mtgcards") return MTGCARDS_CARD_SITE;
  return OPECARDS_CARD_SITE;
}

async function fillCardsFrFaces(opts: {
  host: CardsFrFaceHost;
  index: LocalPrintsIndex;
  force?: boolean;
  refreshIndex?: boolean;
  maxPages?: number;
  delayMs?: number;
  downloadDelayMs?: number;
  limit?: number;
}): Promise<FillCardsFrFacesReport> {
  const { host, index } = opts;
  const indexFile = cardsFrFaceIndexPath(host);
  const site = cardsFrFaceSite(host);
  const meta = tcgCardsSite(host);
  const packId = meta.packId;
  const printGame = meta.printGame;
  if (!packId || !printGame) {
    throw new Error(`tcgcards: ${host} has no packId/printGame`);
  }

  if (
    opts.refreshIndex ||
    !existsSync(indexFile) ||
    loadIndex(indexFile).length === 0
  ) {
    await scrapeDbscardsIndex({
      packId,
      lang: "fr",
      site,
      indexPath: indexFile,
      maxPages: opts.maxPages ?? 400,
      delayMs: opts.delayMs ?? 300,
      onProgress: (page) => {
        if (page === 1 || page % 25 === 0) {
          console.log(`   ${host} list — page ${page}`);
        }
      },
    });
  }

  const entries = loadIndex(indexFile);
  const report: FillCardsFrFacesReport = {
    host,
    indexCards: entries.length,
    tried: 0,
    written: 0,
    skipped: 0,
    unmapped: 0,
    unknownPrint: 0,
    failed: 0,
    indexFile,
  };

  const assets: Array<{
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }> = [];
  const delay = opts.downloadDelayMs ?? 120;
  const limit = opts.limit ?? Infinity;
  const seen = new Set<string>();

  for (const tile of entries) {
    if (report.tried >= limit) break;
    const printKey = cardsFrShopPrintKey({
      game: printGame,
      print: {
        slug: tile.slug,
        ref: tile.ref,
        image: tile.imageFront,
      },
    });
    if (!printKey) {
      report.unmapped += 1;
      continue;
    }
    if (seen.has(printKey)) continue;
    seen.add(printKey);

    const row = index.lookupRow(printKey, { language: "fr" });
    if (!row) {
      report.unknownPrint += 1;
      continue;
    }

    const url = tile.imageFront;
    if (!url) {
      report.failed += 1;
      continue;
    }

    const lang = (tile.lang ?? "fr").toLowerCase();
    const cardDir = packCardDir(packId, {
      set: row.setCode,
      lang,
      card: row.number,
    });
    report.tried += 1;

    const artName = `art.${host}.webp`;
    if (!opts.force && existingHostArt(cardDir, host)) {
      report.skipped += 1;
      assets.push({ printKey, lang, art: artName, sourceUrl: url });
      continue;
    }

    if (delay > 0) await sleep(delay);
    const installed = await installCardFace({
      destDir: cardDir,
      artName,
      url,
      webpQuality: 85,
      referer: site.origin + "/",
      fetchImage: (faceUrl) =>
        downloadCardFaceBytes(faceUrl, {
          referer: site.origin + "/",
          timeoutMs: 40_000,
          minBytes: 4_000,
        }),
    });
    if (installed) {
      if (installed.downloaded) report.written += 1;
      else report.skipped += 1;
      assets.push({ printKey, lang, art: installed.art, sourceUrl: url });
    } else {
      report.failed += 1;
    }
  }

  if (assets.length) {
    index.writeAssets(assets);
  }

  return report;
}

export async function fillYgocardsFaces(
  opts: {
    index: LocalPrintsIndex;
    force?: boolean;
    refreshIndex?: boolean;
    maxPages?: number;
    delayMs?: number;
    downloadDelayMs?: number;
    limit?: number;
  },
): Promise<FillCardsFrFacesReport> {
  return fillCardsFrFaces({ ...opts, host: "ygocards" });
}

export async function fillMtgcardsFaces(
  opts: {
    index: LocalPrintsIndex;
    force?: boolean;
    refreshIndex?: boolean;
    maxPages?: number;
    delayMs?: number;
    downloadDelayMs?: number;
    limit?: number;
  },
): Promise<FillCardsFrFacesReport> {
  return fillCardsFrFaces({ ...opts, host: "mtgcards" });
}

export async function fillOpecardsFaces(
  opts: {
    index: LocalPrintsIndex;
    force?: boolean;
    refreshIndex?: boolean;
    maxPages?: number;
    delayMs?: number;
    downloadDelayMs?: number;
    limit?: number;
  },
): Promise<FillCardsFrFacesReport> {
  return fillCardsFrFaces({ ...opts, host: "opecards" });
}
