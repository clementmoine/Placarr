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
import { extractCardVisualSignals } from "@/core/identify/cardVisualSignals";
import { packDataDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";

export type CardVisualIndexEntry = {
  printKey: string;
  lang: string;
  set: string;
  card: string;
  /** Relative path under the pack data dir. */
  artRel: string;
  /** Art-band dHash (64-bit binary string). */
  hash: string;
  /** Art-band aHash (64-bit) — optional on legacy v1 indexes. */
  aHash?: string;
  /** Art-band 6×6 RGB grid (hex) — optional on legacy v1 indexes. */
  color?: string;
  /**
   * Face file fingerprint (`size-mtime`, see {@link faceFingerprint}). Lets
   * Sync reuse signals/vectors for unchanged faces and re-encode a face that
   * was rewritten in place under the same name.
   */
  fp?: string;
};

export type CardVisualIndexFile = {
  /** v2 adds aHash + color; v3 indexes every on-disk `art.*` sibling. */
  version: 1 | 2 | 3;
  packId: string;
  lang: string;
  builtAt: string;
  entries: CardVisualIndexEntry[];
};

/** v3: every on-disk `art.*` sibling (not only `print_assets.art`). */
export const CARD_VISUAL_INDEX_VERSION = 3 as const;

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

/**
 * Cheap identity of a face file on disk — same shape as the HTTP ETag the
 * assets route derives (`size-mtime` hex). Null when the file is missing.
 */
export function faceFingerprint(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    return `${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}`;
  } catch {
    return null;
  }
}

/**
 * Reuse key for a face row. Three parts when `artRel` is set (recto and
 * verso of the same print are different files); two parts = "this print in
 * this locale" (layout-merge exclude / legacy prior lookup).
 */
export function visualEntryKey(
  printKey: string,
  lang: string,
  artRel?: string,
): string {
  return artRel ? `${printKey}\0${lang}\0${artRel}` : `${printKey}\0${lang}`;
}

/** Front scan (`art.*`). Versos use `back.*` and share the printKey. */
export function isFrontArtRel(artRel: string): boolean {
  const base = artRel.split("/").pop() ?? artRel;
  return /^art(\.|$)/i.test(base);
}

/**
 * Prior entry still describes this face — same file, same bytes (fingerprint)
 * and already carrying the v2 multi-signal fields.
 */
export function canReuseVisualEntry(
  prior: CardVisualIndexEntry | undefined,
  artRel: string,
  fp: string | null,
): prior is CardVisualIndexEntry {
  return Boolean(
    prior &&
    prior.artRel === artRel &&
    fp &&
    prior.fp === fp &&
    prior.aHash &&
    prior.color,
  );
}

/** Same faces, same signals — order-sensitive, ignores `builtAt`. */
export function visualIndexEntriesEqual(
  a: readonly CardVisualIndexEntry[],
  b: readonly CardVisualIndexEntry[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.printKey !== y.printKey ||
      x.lang !== y.lang ||
      x.artRel !== y.artRel ||
      x.hash !== y.hash ||
      x.aHash !== y.aHash ||
      x.color !== y.color ||
      x.fp !== y.fp
    ) {
      return false;
    }
  }
  return true;
}

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
    if (
      (parsed?.version !== 1 &&
        parsed?.version !== 2 &&
        parsed?.version !== 3) ||
      !Array.isArray(parsed.entries)
    ) {
      return null;
    }
    indexCache.set(packId, { mtimeMs, file: parsed });
    return parsed;
  } catch {
    indexCache.delete(packId);
    return null;
  }
}

/**
 * Persist an index unless it is byte-for-byte the same faces/signals as
 * `prior`: a no-op Sync must not bump mtimes (that is what tells the
 * embedding step and the client shards whether anything changed).
 */
export function writeCardVisualIndexIfChanged(
  file: CardVisualIndexFile,
  prior: CardVisualIndexFile | null,
): { file: CardVisualIndexFile; written: boolean } {
  if (
    prior &&
    prior.version === file.version &&
    prior.lang === file.lang &&
    visualIndexEntriesEqual(prior.entries, file.entries)
  ) {
    return { file: prior, written: false };
  }
  return { file: writeCardVisualIndex(file), written: true };
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

async function signalsFromFile(
  filePath: string,
): Promise<{ hash: string; aHash: string; color: string } | null> {
  if (!existsSync(filePath)) return null;
  const signals = await extractCardVisualSignals(readFileSync(filePath), {
    artBand: true,
  });
  if (!signals) return null;
  return {
    hash: signals.dHash,
    aHash: signals.aHash,
    color: signals.color,
  };
}

function listRoleFiles(dir: string, role: "art" | "back"): string[] {
  if (!existsSync(dir)) return [];
  const prefix = role === "art" ? /^art(\.|$)/i : /^back(\.|$)/i;
  return readdirSync(dir).filter(
    (name) => prefix.test(name) && /\.(webp|jpg|jpeg|png|gif)$/i.test(name),
  );
}

function pickRoleName(files: string[], role: "art" | "back"): string | null {
  if (!files.length) return null;
  const exact = files.find((n) => n.toLowerCase() === `${role}.webp`);
  if (exact) return exact;
  return files.find((n) => n.toLowerCase().startsWith(`${role}.`)) ?? files[0]!;
}

/**
 * Every on-disk `art.*` (or a single best `back.*`). Phone scans of foil
 * cards often match a marketplace photo better than the HD catalogue dump
 * the tile prefers — index both, let NN + printKey dedupe pick the closer
 * vector.
 */
function listFaceNames(dir: string, role: "art" | "back"): string[] {
  const files = listRoleFiles(dir, role);
  if (role === "back") {
    const one = pickRoleName(files, role);
    return one ? [one] : [];
  }
  return [...files].sort((a, b) => a.localeCompare(b));
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

async function pushFaceFile(opts: {
  printKey: string;
  lang: string;
  set: string;
  card: string;
  abs: string;
  artRel: string;
  entries: CardVisualIndexEntry[];
  seen: Set<string>;
  prior: ReadonlyMap<string, CardVisualIndexEntry> | null;
  exclude?: ReadonlySet<string>;
}): Promise<boolean> {
  const faceKey = visualEntryKey(opts.printKey, opts.lang, opts.artRel);
  const localeKey = visualEntryKey(opts.printKey, opts.lang);
  if (
    opts.seen.has(faceKey) ||
    opts.exclude?.has(faceKey) ||
    opts.exclude?.has(localeKey)
  ) {
    return false;
  }
  const fp = faceFingerprint(opts.abs);
  const prev =
    opts.prior?.get(faceKey) ??
    (isFrontArtRel(opts.artRel) ? opts.prior?.get(localeKey) : undefined);
  if (canReuseVisualEntry(prev, opts.artRel, fp)) {
    opts.seen.add(faceKey);
    opts.entries.push({ ...prev, set: opts.set, card: opts.card });
    return true;
  }
  const signals = await signalsFromFile(opts.abs);
  if (!signals) return false;
  opts.seen.add(faceKey);
  opts.entries.push({
    printKey: opts.printKey,
    lang: opts.lang,
    set: opts.set,
    card: opts.card,
    artRel: opts.artRel,
    hash: signals.hash,
    aHash: signals.aHash,
    color: signals.color,
    ...(fp ? { fp } : {}),
  });
  return true;
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
  prior: ReadonlyMap<string, CardVisualIndexEntry> | null;
  exclude?: ReadonlySet<string>;
}): Promise<void> {
  const printKey = `${opts.printGame}:${opts.set}-${opts.card}`;
  const localeKey = visualEntryKey(printKey, opts.lang);
  // A previous layout pass already indexed this print+locale (front ± back).
  if (opts.seen.has(localeKey) || opts.exclude?.has(localeKey)) return;

  const faces: Array<{ name: string }> = [
    ...listFaceNames(opts.cardDir, "art").map((name) => ({ name })),
    ...listFaceNames(opts.cardDir, "back").map((name) => ({ name })),
  ];
  if (!faces.length) return;

  let added = false;
  for (const face of faces) {
    const ok = await pushFaceFile({
      printKey,
      lang: opts.lang,
      set: opts.set,
      card: opts.card,
      abs: path.join(opts.cardDir, face.name),
      artRel: [...opts.relParts, face.name].join("/"),
      entries: opts.entries,
      seen: opts.seen,
      prior: opts.prior,
      exclude: opts.exclude,
    });
    added = added || ok;
  }
  if (added) opts.seen.add(localeKey);
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
  /**
   * Previous index entries — faces whose file fingerprint is unchanged are
   * copied instead of decoded again. Default: the on-disk index of the pack.
   */
  prior?: readonly CardVisualIndexEntry[] | null;
  /**
   * `visualEntryKey`s the caller already holds (multi-layout merge) — those
   * faces are skipped before any disk work instead of decoded then dropped.
   */
  exclude?: ReadonlySet<string>;
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
  // `prior: null` = force (decode everything, always rewrite).
  const onDisk = opts.prior === null ? null : loadCardVisualIndex(opts.packId);
  const prior = indexEntriesByKey(
    opts.prior === undefined ? onDisk?.entries : opts.prior,
  );
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
          prior,
          exclude: opts.exclude,
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
            prior,
            exclude: opts.exclude,
          });
        }
      }
    }
  }

  const file: CardVisualIndexFile = {
    version: CARD_VISUAL_INDEX_VERSION,
    packId: opts.packId,
    lang,
    builtAt: new Date().toISOString(),
    entries,
  };
  if (opts.write === false) return file;
  return writeCardVisualIndexIfChanged(file, onDisk).file;
}

/** Face key + locale key (front only) → entry, for incremental rebuilds. */
export function indexEntriesByKey(
  entries: readonly CardVisualIndexEntry[] | null | undefined,
): Map<string, CardVisualIndexEntry> | null {
  if (!entries?.length) return null;
  const map = new Map<string, CardVisualIndexEntry>();
  for (const entry of entries) {
    map.set(visualEntryKey(entry.printKey, entry.lang, entry.artRel), entry);
    if (isFrontArtRel(entry.artRel)) {
      map.set(visualEntryKey(entry.printKey, entry.lang), entry);
    }
  }
  return map;
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
  /** How many independent visual channels voted for this key (dHash/aHash/color). */
  votes?: number;
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
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
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
  if (top.length >= 2 && top[1]!.distance - top[0]!.distance < minMargin) {
    return top.map((row) => ({ ...row, ambiguous: true }));
  }
  return top.map(({ ambiguous: _a, ...row }) => row);
}
