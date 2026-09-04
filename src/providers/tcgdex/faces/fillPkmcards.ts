/**
 * Pokémon faces from pkmcards.fr list tiles → `art.pkmcards.webp`.
 *
 * Same rule as Masters dbscards: take every source face we can place. Skip only
 * when `art.pkmcards.*` is already on disk (unless `force`). Live/Coleka stay
 * preferred for display via faceChoice — this still stores the pkmcards file.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir } from "@/lib/packPaths";
import type { DbscardsIndexEntry } from "@/providers/shared/dbscards/list";
import {
  pkmcardsIndexPath,
  PKMCARDS_CARD_SITE,
  scrapeDbscardsIndex,
} from "@/providers/shared/dbscards/scrapeList";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../faceChoice";
import { pokemonPaperCardDir } from "../paperCardDisk";
import {
  buildPkmcardsAbbrToLiveStem,
  resolvePkmcardsAbbrToLiveStem,
} from "./pkmcardsSetMap";
import { parsePkmcardsPokemonSlug } from "./pkmcardsSlug";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 500) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export type FillPkmcardsReport = {
  lang: string;
  indexCards: number;
  tried: number;
  written: number;
  skipped: number;
  /** No Live/abbr stem mapping for this tile. */
  unmapped: number;
  failed: number;
  indexFile: string | null;
};

function loadIndex(file: string): DbscardsIndexEntry[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(raw) ? (raw as DbscardsIndexEntry[]) : [];
  } catch {
    return [];
  }
}

export async function scrapePkmcardsCardIndex(opts: {
  lang?: string;
  maxPages?: number;
  delayMs?: number;
  force?: boolean;
} = {}): Promise<{ file: string; cards: number; pages: number }> {
  const lang = (opts.lang ?? "fr").toLowerCase();
  const file = pkmcardsIndexPath(lang);
  if (!opts.force && existsSync(file)) {
    const entries = loadIndex(file);
    if (entries.length > 0) {
      return { file, cards: entries.length, pages: 0 };
    }
  }
  const result = await scrapeDbscardsIndex({
    packId: "pokemon",
    lang,
    site: PKMCARDS_CARD_SITE,
    indexPath: file,
    maxPages: opts.maxPages ?? 700,
    delayMs: opts.delayMs ?? 300,
  });
  return { file: result.file, cards: result.cards, pages: result.pages };
}

export async function fillPkmcardsFaces(opts: {
  lang?: string;
  force?: boolean;
  /** Re-crawl list even when `pkmcards-<lang>.json` exists. */
  refreshIndex?: boolean;
  maxPages?: number;
  delayMs?: number;
  downloadDelayMs?: number;
  limit?: number;
  cardsRoot?: string;
  /** Skip network scrape; use this index file (tests). */
  indexFile?: string;
  entries?: readonly DbscardsIndexEntry[];
} = {}): Promise<FillPkmcardsReport> {
  const lang = (opts.lang ?? "fr").toLowerCase();
  const cardsRoot = opts.cardsRoot ?? packCardsDir("pokemon");
  const abbrMap = buildPkmcardsAbbrToLiveStem(cardsRoot);

  let indexFile: string | null = opts.indexFile ?? null;
  let entries: readonly DbscardsIndexEntry[] = opts.entries ?? [];

  if (!opts.entries) {
    if (opts.indexFile) {
      entries = loadIndex(opts.indexFile);
    } else {
      const scraped = await scrapePkmcardsCardIndex({
        lang,
        maxPages: opts.maxPages,
        delayMs: opts.delayMs,
        force: opts.refreshIndex ?? opts.force,
      });
      indexFile = scraped.file;
      entries = loadIndex(scraped.file);
    }
  }

  const report: FillPkmcardsReport = {
    lang,
    indexCards: entries.length,
    tried: 0,
    written: 0,
    skipped: 0,
    unmapped: 0,
    failed: 0,
    indexFile,
  };

  const delay = opts.downloadDelayMs ?? 80;
  let processed = 0;

  for (const entry of entries) {
    if (opts.limit != null && processed >= opts.limit) break;
    const parsed = parsePkmcardsPokemonSlug(entry.slug);
    if (!parsed) {
      report.unmapped += 1;
      continue;
    }
    const liveStem = resolvePkmcardsAbbrToLiveStem(
      parsed.setAbbr,
      cardsRoot,
      abbrMap,
    );
    if (!liveStem) {
      report.unmapped += 1;
      continue;
    }
    const tileLang = parsed.lang || lang;
    const cardDir = pokemonPaperCardDir({
      setId: liveStem,
      lang: tileLang,
      localId: parsed.number,
      cardsRoot,
    });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("pkmcards", "art", "webp"),
    );
    // Per-source skip — same as dbscards: other faces on disk do not block.
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      continue;
    }
    const url = entry.imageFront?.trim();
    if (!url) {
      report.failed += 1;
      continue;
    }
    report.tried += 1;
    processed += 1;
    if (delay > 0 && report.tried > 1) await sleep(delay);
    const buf = await download(url);
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, tileLang);
    report.written += 1;
  }

  return report;
}
