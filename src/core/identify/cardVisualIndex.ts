/**
 * Offline visual index for cardboard ID (camera / photo → printKey).
 *
 * dHash 64-bit over pack face trees. Match is top‑k + user confirm —
 * never auto-accept. Pack / printGame are always caller-supplied — no
 * provider defaults in core.
 *
 * Disk layouts supported:
 * - lang-first: `cards/{lang}/{set}/{card}/` (Carddass, Lorcana, DBS CG…)
 * - set/lang/card: `cards/{set}/{lang}/{card}/` (OPTCG, YGO, Live, Kayou…)
 *
 * Prefer {@link rebuild via providers/shared/cardCatalogue/visualIndexStep}
 * (catalogue `print_assets`) when a pack has a sqlite ledger — disk walk is
 * the fallback when art paths are not yet joined to printKeys.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  dHashFromBuffer,
  hammingDistance,
} from "@/core/enrich/media/imageAssets";
import { packDataDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

export type CardVisualIndexEntry = {
  printKey: string;
  lang: string;
  set: string;
  card: string;
  /** Relative path under the pack data dir. */
  artRel: string;
  hash: string;
};

export type CardVisualIndexFile = {
  version: 1;
  packId: string;
  lang: string;
  builtAt: string;
  entries: CardVisualIndexEntry[];
};

const INDEX_NAME = "card-visual-index.json";
const LANG_SEGMENT = /^[a-z]{2}([a-z]{2})?$/i;

/** Face locales — excludes 2–4 letter set codes (`ec`, `gaku`, …). */
const FACE_LANGS = new Set([
  "fr",
  "en",
  "ja",
  "it",
  "de",
  "es",
  "pt",
  "ko",
  "zh",
  "nl",
  "pl",
  "ru",
]);

function isFaceLang(name: string): boolean {
  const code = name.trim().toLowerCase();
  return FACE_LANGS.has(code) && LANG_SEGMENT.test(code);
}

export { dHashFromBuffer };

export function cardVisualIndexPath(packId: string): string {
  return path.join(packDataDir(packId), INDEX_NAME);
}

/** Process-local cache — live camera hits this every ~1s; avoid re-parsing 70k+ JSON. */
const indexCache = new Map<
  string,
  { mtimeMs: number; file: CardVisualIndexFile }
>();

export function loadCardVisualIndex(
  packId: string,
): CardVisualIndexFile | null {
  const filePath = cardVisualIndexPath(packId);
  if (!existsSync(filePath)) {
    indexCache.delete(packId);
    return null;
  }
  try {
    const mtimeMs = statSync(filePath).mtimeMs;
    const cached = indexCache.get(packId);
    if (cached && cached.mtimeMs === mtimeMs) return cached.file;
    const parsed = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as CardVisualIndexFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return null;
    indexCache.set(packId, { mtimeMs, file: parsed });
    return parsed;
  } catch {
    indexCache.delete(packId);
    return null;
  }
}

/** Persist an already-built index file. */
export function writeCardVisualIndex(
  file: CardVisualIndexFile,
): CardVisualIndexFile {
  const dest = cardVisualIndexPath(file.packId);
  writeFileSync(dest, JSON.stringify(file));
  try {
    indexCache.set(file.packId, {
      mtimeMs: statSync(dest).mtimeMs,
      file,
    });
  } catch {
    indexCache.delete(file.packId);
  }
  return file;
}

/**
 * Pack ids that already have a visual index on disk (no hardcode — discover).
 * Walks `data/` up to depth 3 for `card-visual-index.json`.
 */
export function listCardVisualIndexPackIds(): string[] {
  const root = dataRoot();
  if (!existsSync(root)) return [];
  const found: string[] = [];

  const walk = (rel: string, depth: number) => {
    if (depth > 3) return;
    const abs = rel ? path.join(root, rel) : root;
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      if (ent.isFile() && ent.name === INDEX_NAME && rel) {
        found.push(rel.split(path.sep).join("/"));
        continue;
      }
      if (ent.isDirectory()) {
        walk(rel ? path.join(rel, ent.name) : ent.name, depth + 1);
      }
    }
  };

  walk("", 0);
  return found.sort();
}

async function dHashFromFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  // Art-band hash — same region as live camera identify (see extractCardArtBand).
  return dHashFromBuffer(readFileSync(filePath), { artBand: true });
}

function listArtFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (name) =>
      /^art(\.|$)/i.test(name) && /\.(webp|jpg|jpeg|png|gif)$/i.test(name),
  );
}

function pickArtName(arts: string[]): string | null {
  if (!arts.length) return null;
  return (
    arts.find((n) => n.toLowerCase() === "art.webp") ??
    arts.find((n) => n.toLowerCase().startsWith("art.")) ??
    arts[0]!
  );
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

async function pushCardDir(opts: {
  packId: string;
  printGame: string;
  lang: string;
  set: string;
  card: string;
  cardDir: string;
  relParts: string[];
  entries: CardVisualIndexEntry[];
  seen: Set<string>;
}): Promise<void> {
  const arts = listArtFiles(opts.cardDir);
  const artName = pickArtName(arts);
  if (!artName) return;
  const dedupe = `${opts.printGame}:${opts.set}-${opts.card}\0${opts.lang}`;
  if (opts.seen.has(dedupe)) return;
  const hash = await dHashFromFile(path.join(opts.cardDir, artName));
  if (!hash) return;
  opts.seen.add(dedupe);
  opts.entries.push({
    printKey: `${opts.printGame}:${opts.set}-${opts.card}`,
    lang: opts.lang,
    set: opts.set,
    card: opts.card,
    artRel: [...opts.relParts, artName].join("/"),
    hash,
  });
}

/**
 * Walk pack face trees and write (or return) the index.
 * `printGame` is required — printKey prefix must come from the owning provider.
 */
export async function buildCardVisualIndex(opts: {
  packId: string;
  printGame: string;
  lang?: string;
  limit?: number;
  /** Also walk `cards/{set}/{lang}/{card}/` (factory TCG layout). */
  alsoSetLangCard?: boolean;
  /** Skip lang-first walk; only set/lang/card. */
  setLangCardOnly?: boolean;
  /** When false, do not write the JSON (caller merges / writes). Default true. */
  write?: boolean;
}): Promise<CardVisualIndexFile> {
  const lang = (opts.lang ?? "fr").toLowerCase();
  const printGame = opts.printGame.trim();
  if (!printGame) {
    throw new Error("buildCardVisualIndex: printGame is required");
  }
  const packRoot = packDataDir(opts.packId);
  const cardsRoot = path.join(packRoot, "cards");
  const entries: CardVisualIndexEntry[] = [];
  const seen = new Set<string>();
  const atLimit = () => opts.limit != null && entries.length >= opts.limit;

  if (!opts.setLangCardOnly) {
    const langRoot = path.join(cardsRoot, lang);
    for (const set of listSubdirs(langRoot)) {
      if (atLimit()) break;
      // Skip nested locale dirs mistaken for sets under a lang root.
      if (isFaceLang(set) && set.toLowerCase() === lang) continue;
      const setDir = path.join(langRoot, set);
      for (const card of listSubdirs(setDir)) {
        if (atLimit()) break;
        await pushCardDir({
          packId: opts.packId,
          printGame,
          lang,
          set,
          card,
          cardDir: path.join(setDir, card),
          relParts: ["cards", lang, set, card],
          entries,
          seen,
        });
      }
    }
  }

  if (opts.alsoSetLangCard || opts.setLangCardOnly) {
    for (const set of listSubdirs(cardsRoot)) {
      if (atLimit()) break;
      if (isFaceLang(set)) continue; // lang-first root
      if (set === "back" || set.startsWith("back.")) continue;
      const setDir = path.join(cardsRoot, set);
      for (const locale of listSubdirs(setDir)) {
        if (atLimit()) break;
        if (!isFaceLang(locale)) continue;
        const localeDir = path.join(setDir, locale);
        for (const card of listSubdirs(localeDir)) {
          if (atLimit()) break;
          await pushCardDir({
            packId: opts.packId,
            printGame,
            lang: locale.toLowerCase(),
            set,
            card,
            cardDir: path.join(localeDir, card),
            relParts: ["cards", set, locale.toLowerCase(), card],
            entries,
            seen,
          });
        }
      }
    }
  }

  const file: CardVisualIndexFile = {
    version: 1,
    packId: opts.packId,
    lang,
    builtAt: new Date().toISOString(),
    entries,
  };
  if (opts.write === false) return file;
  return writeCardVisualIndex(file);
}

export type CardVisualMatch = {
  printKey: string;
  lang: string;
  distance: number;
  artRel: string;
  packId?: string;
  /**
   * True when #1 and #2 are too close — scanners abstain rather than guess
   * (relative margin, cf. OpenRift / pokemon-tcg-scanner notes).
   */
  ambiguous?: boolean;
};

/** Top‑k nearest dHash neighbours. Caller must confirm — never auto-accept. */
export function matchCardVisualHash(
  hash: string,
  index: CardVisualIndexFile,
  opts?: { limit?: number; maxDistance?: number; minMargin?: number },
): CardVisualMatch[] {
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 10;
  const minMargin = opts?.minMargin ?? 2;
  const scored: CardVisualMatch[] = [];
  for (const entry of index.entries) {
    const distance = hammingDistance(hash, entry.hash);
    if (distance > maxDistance) continue;
    scored.push({
      printKey: entry.printKey,
      lang: entry.lang,
      distance,
      artRel: entry.artRel,
      packId: index.packId,
    });
  }
  scored.sort(
    (a, b) => a.distance - b.distance || a.printKey.localeCompare(b.printKey),
  );
  const top = scored.slice(0, limit);
  if (
    top.length >= 2 &&
    top[1]!.distance - top[0]!.distance < minMargin
  ) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top;
}

/** Match against every on-disk visual index (pack-agnostic MVP). */
export function matchCardVisualHashAcrossPacks(
  hash: string,
  opts?: {
    limit?: number;
    maxDistance?: number;
    minMargin?: number;
    packIds?: string[];
  },
): CardVisualMatch[] {
  const packIds = opts?.packIds ?? listCardVisualIndexPackIds();
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 10;
  const scored: CardVisualMatch[] = [];
  for (const packId of packIds) {
    const index = loadCardVisualIndex(packId);
    if (!index?.entries.length) continue;
    // Pull a wider pool per pack, then re-rank globally (avoids one pack's
    // mediocre d=10 flooding out a sharp hit from another).
    scored.push(
      ...matchCardVisualHash(hash, index, {
        limit: Math.max(limit, 12),
        maxDistance,
        minMargin: 0,
      }),
    );
  }
  scored.sort(
    (a, b) => a.distance - b.distance || a.printKey.localeCompare(b.printKey),
  );
  const top = scored.slice(0, limit);
  const minMargin = opts?.minMargin ?? 2;
  if (
    top.length >= 2 &&
    top[1]!.distance - top[0]!.distance < minMargin
  ) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top.map(({ ambiguous: _a, ...row }) => row);
}
