/**
 * Install FR shop faces from ygocards.fr / mtgcards.fr list tiles.
 *
 * Catalogue prints stay seeded by YGOPRODeck / Scryfall; this only drops
 * `art.ygocards.webp` / `art.mtgcards.webp` when the printKey already exists
 * and the host file is missing (unless `force`).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";
import {
  installCardFace,
  downloadCardFaceBytes,
} from "@/providers/shared/cardCatalogue/faceInstall";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  mtgcardsSlugToPrintKey,
  ygocardsTileToPrintKey,
} from "@/providers/shared/tcgcards/cardsFrPrintRef";
import type { DbscardsIndexEntry } from "@/providers/shared/tcgcards/list";
import {
  MTGCARDS_CARD_SITE,
  YGOCARDS_CARD_SITE,
  mtgcardsIndexPath,
  scrapeDbscardsIndex,
  ygocardsIndexPath,
} from "@/providers/shared/tcgcards/scrapeList";

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
  host: "ygocards" | "mtgcards";
  indexCards: number;
  tried: number;
  written: number;
  skipped: number;
  unmapped: number;
  unknownPrint: number;
  failed: number;
  indexFile: string | null;
};

async function fillCardsFrFaces(opts: {
  host: "ygocards" | "mtgcards";
  packId: string;
  index: LocalPrintsIndex;
  force?: boolean;
  refreshIndex?: boolean;
  maxPages?: number;
  delayMs?: number;
  downloadDelayMs?: number;
  limit?: number;
}): Promise<FillCardsFrFacesReport> {
  const { host, packId, index } = opts;
  const indexFile =
    host === "ygocards" ? ygocardsIndexPath("fr") : mtgcardsIndexPath("fr");
  const site = host === "ygocards" ? YGOCARDS_CARD_SITE : MTGCARDS_CARD_SITE;

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
    const printKey =
      host === "ygocards"
        ? ygocardsTileToPrintKey(tile)
        : mtgcardsSlugToPrintKey(tile.slug);
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
  return fillCardsFrFaces({ ...opts, host: "ygocards", packId: "yugioh" });
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
  return fillCardsFrFaces({ ...opts, host: "mtgcards", packId: "mtg" });
}
