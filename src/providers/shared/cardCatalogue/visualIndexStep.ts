/**
 * Rebuild the camera dHash index for a catalogue dataPack.
 *
 * Catalogue-first (`print_assets` → disk art), then disk walk fallback.
 * No pack-id allowlist — callers pass the pack they own / just synced.
 *
 * Incremental: a face whose file fingerprint (`size-mtime`) matches the prior
 * index entry is copied, not decoded; the index file is rewritten only when
 * something actually changed, so a no-op Sync leaves mtimes alone.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  buildCardVisualIndex,
  canReuseVisualEntry,
  CARD_VISUAL_INDEX_VERSION,
  cardVisualIndexPath,
  faceFingerprint,
  indexEntriesByKey,
  loadCardVisualIndex,
  visualEntryKey,
  writeCardVisualIndexIfChanged,
  type CardVisualIndexEntry,
  type CardVisualIndexFile,
} from "@/core/identify/cardVisualIndex";
import { extractCardVisualSignals } from "@/core/identify/cardVisualSignals";
import { parsePrintKey } from "@/core/identify/printKey";
import { printKeyGameForPack } from "@/lib/media/resolvePrintFace";
import { packCardsDir, packCatalogDb, packDataDir } from "@/lib/packPaths";

const HASH_CONCURRENCY = 8;

const LANG_SEGMENT = /^[a-z]{2}([a-z]{2})?$/i;

/** Locales we treat as face languages (not set codes like `ec` / `gaku`). */
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

type AssetRow = {
  printKey: string;
  lang: string;
  art: string;
};

function listPrintAssets(packId: string): AssetRow[] {
  const dbPath = packCatalogDb(packId);
  if (!existsSync(dbPath)) return [];
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return [];
  }
  try {
    const has = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master
          WHERE type = 'table' AND name = 'print_assets' LIMIT 1`,
      )
      .get() as { ok?: number } | undefined;
    if (!has?.ok) return [];
    return (
      db
        .prepare(
          `SELECT print_key AS printKey, lang, art
             FROM print_assets
            WHERE art IS NOT NULL AND TRIM(art) != ''`,
        )
        .all() as AssetRow[]
    )
      .map((row) => ({
        printKey: String(row.printKey ?? "").trim(),
        lang: String(row.lang ?? "")
          .trim()
          .toLowerCase(),
        art: String(row.art ?? "").trim(),
      }))
      .filter((row) => row.printKey && row.lang && row.art);
  } catch {
    return [];
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Resolve `print_assets.art` onto disk. Packs use either
 * `cards/{lang}/{set}/{card}/` (Carddass / Lorcana / DBS CG) or
 * `cards/{set}/{lang}/{card}/` (OPTCG / YGO / Live / Kayou).
 */
export function resolveCatalogueArtPath(
  packId: string,
  printKey: string,
  lang: string,
  artBasename: string,
): { abs: string; artRel: string; set: string; card: string } | null {
  const id = parsePrintKey(printKey);
  if (!id) return null;
  const card = id.grouping ? `${id.number}-${id.grouping}` : id.number;
  const set = id.set;
  const code = lang.trim().toLowerCase();
  const base = artBasename.trim();
  if (!code || !base || !set || !card) return null;

  const cards = packCardsDir(packId);
  const packRoot = packDataDir(packId);
  const candidates = [
    path.join(cards, code, set, card, base),
    path.join(cards, set, code, card, base),
  ];
  for (const abs of candidates) {
    if (!existsSync(abs)) continue;
    return {
      abs,
      artRel: path.relative(packRoot, abs).split(path.sep).join("/"),
      set,
      card,
    };
  }
  return null;
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

export type VisualIndexBuildStats = {
  /** Faces copied from the prior index (fingerprint unchanged). */
  reused: number;
  /** Faces decoded + hashed this run. */
  hashed: number;
};

async function buildFromCatalogue(opts: {
  packId: string;
  langs?: readonly string[];
  limit?: number;
  prior: CardVisualIndexFile | null;
  stats: VisualIndexBuildStats;
}): Promise<CardVisualIndexEntry[]> {
  const langFilter = opts.langs?.length
    ? new Set(opts.langs.map((l) => l.trim().toLowerCase()).filter(Boolean))
    : null;
  const seen = new Set<string>();
  const priorByKey = indexEntriesByKey(opts.prior?.entries);
  type Pending = {
    printKey: string;
    lang: string;
    set: string;
    card: string;
    artRel: string;
    abs: string;
    fp: string | null;
  };
  // Keep catalogue order: slot = reused entry or a pending decode.
  const slots: Array<CardVisualIndexEntry | Pending> = [];

  for (const row of listPrintAssets(opts.packId)) {
    if (opts.limit != null && slots.length >= opts.limit) break;
    if (!FACE_LANGS.has(row.lang)) continue;
    if (langFilter && !langFilter.has(row.lang)) continue;
    const resolved = resolveCatalogueArtPath(
      opts.packId,
      row.printKey,
      row.lang,
      row.art,
    );
    if (!resolved) continue;
    const dedupe = visualEntryKey(row.printKey, row.lang);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const fp = faceFingerprint(resolved.abs);
    const prev = priorByKey?.get(dedupe);
    if (canReuseVisualEntry(prev, resolved.artRel, fp)) {
      opts.stats.reused += 1;
      slots.push({ ...prev, set: resolved.set, card: resolved.card });
      continue;
    }
    slots.push({
      printKey: row.printKey,
      lang: row.lang,
      set: resolved.set,
      card: resolved.card,
      artRel: resolved.artRel,
      abs: resolved.abs,
      fp,
    });
  }

  const hashed = await mapPool(slots, HASH_CONCURRENCY, async (slot) => {
    if (!("abs" in slot)) return slot;
    const signals = await extractCardVisualSignals(readFileSync(slot.abs), {
      artBand: true,
    });
    if (!signals) return null;
    opts.stats.hashed += 1;
    return {
      printKey: slot.printKey,
      lang: slot.lang,
      set: slot.set,
      card: slot.card,
      artRel: slot.artRel,
      hash: signals.dHash,
      aHash: signals.aHash,
      color: signals.color,
      ...(slot.fp ? { fp: slot.fp } : {}),
    } satisfies CardVisualIndexEntry;
  });
  return hashed.filter((row): row is CardVisualIndexEntry => row != null);
}

function primaryLangLabel(
  entries: readonly CardVisualIndexEntry[],
  preferred?: readonly string[],
): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!FACE_LANGS.has(entry.lang)) continue;
    counts.set(entry.lang, (counts.get(entry.lang) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!),
  );
  if (preferred?.length) {
    const want = preferred
      .map((l) => l.trim().toLowerCase())
      .filter((l) => FACE_LANGS.has(l));
    for (const lang of want) {
      if ((counts.get(lang) ?? 0) > 0) return lang;
    }
  }
  return ranked[0]?.[0] ?? "multi";
}

function listLangDirs(cardsRoot: string): string[] {
  if (!existsSync(cardsRoot)) return [];
  try {
    return readdirSync(cardsRoot, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          FACE_LANGS.has(d.name.toLowerCase()) &&
          LANG_SEGMENT.test(d.name),
      )
      .map((d) => d.name.toLowerCase())
      .sort();
  } catch {
    return [];
  }
}

/**
 * Rebuild `card-visual-index.json` for a dataPack.
 * Prefers catalogue `print_assets` (correct printKeys); falls back to a
 * lang-first + set/lang/card disk walk when the ledger has no resolvable art.
 */
function indexLooksFresh(packId: string): CardVisualIndexFile | null {
  const existing = loadCardVisualIndex(packId);
  if (!existing?.entries.length) return null;
  // Force rebuild when missing aHash/color (v2 multi-signal).
  if (
    existing.version < CARD_VISUAL_INDEX_VERSION ||
    !existing.entries.some((e) => e.aHash && e.color)
  ) {
    return null;
  }
  const indexPath = cardVisualIndexPath(packId);
  const dbPath = packCatalogDb(packId);
  try {
    const indexMtime = statSync(indexPath).mtimeMs;
    // Catalogue ledger is the SSOT for printKeys ↔ art; skip rebuild when
    // the index is at least as new as catalog.sqlite (faces-only dumps that
    // do not touch the ledger still need `--force` / diskOnly).
    if (existsSync(dbPath) && statSync(dbPath).mtimeMs > indexMtime) {
      return null;
    }
  } catch {
    return null;
  }
  return existing;
}

export async function runDataPackCardVisualIndex(
  packId: string,
  opts?: {
    langs?: readonly string[];
    limit?: number;
    /** Force disk walk even when the catalogue has rows. */
    diskOnly?: boolean;
    /**
     * Ignore the prior index entirely: every face is decoded again and the
     * file is rewritten. Default is incremental on face fingerprints.
     */
    force?: boolean;
    onLog?: (line: string) => void;
  },
): Promise<CardVisualIndexFile> {
  if (!opts?.force && !opts?.diskOnly && opts?.limit == null) {
    const fresh = indexLooksFresh(packId);
    if (fresh) return fresh;
  }

  const prior = opts?.force ? null : loadCardVisualIndex(packId);
  const stats: VisualIndexBuildStats = { reused: 0, hashed: 0 };
  const printGame = printKeyGameForPack(packId);
  if (!opts?.diskOnly) {
    const fromCat = await buildFromCatalogue({
      packId,
      langs: opts?.langs,
      limit: opts?.limit,
      prior,
      stats,
    });
    if (fromCat.length > 0) {
      const { file, written } = writeCardVisualIndexIfChanged(
        {
          version: CARD_VISUAL_INDEX_VERSION,
          packId,
          lang: primaryLangLabel(fromCat, opts?.langs),
          builtAt: new Date().toISOString(),
          entries: fromCat,
        },
        prior,
      );
      opts?.onLog?.(
        `── card visual index — ${stats.reused} reused, ${stats.hashed} hashed` +
          (written ? "" : " — unchanged, not rewritten"),
      );
      return file;
    }
  }

  const preferred = opts?.langs?.[0]?.trim().toLowerCase();
  const cardsRoot = packCardsDir(packId);
  const langDirs = listLangDirs(cardsRoot);

  if (langDirs.length) {
    const merged: CardVisualIndexEntry[] = [];
    const seen = new Set<string>();
    const langs =
      preferred && langDirs.includes(preferred) ? [preferred] : langDirs;
    for (const lang of langs) {
      if (opts?.limit != null && merged.length >= opts.limit) break;
      const partial = await buildCardVisualIndex({
        packId,
        printGame,
        lang,
        limit:
          opts?.limit != null
            ? Math.max(0, opts.limit - merged.length)
            : undefined,
        alsoSetLangCard: false,
        write: false,
        prior: prior?.entries ?? null,
        exclude: seen,
      });
      for (const entry of partial.entries) {
        const key = `${entry.printKey}\0${entry.lang}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(entry);
      }
    }
    const setLayout = await buildCardVisualIndex({
      packId,
      printGame,
      lang: preferred || langDirs[0] || "en",
      limit:
        opts?.limit != null
          ? Math.max(0, opts.limit - merged.length)
          : undefined,
      alsoSetLangCard: true,
      setLangCardOnly: true,
      write: false,
      prior: prior?.entries ?? null,
      // Faces already indexed from the lang-first layout are not decoded
      // again just to be dropped by the merge (Pokémon: ~4.7k faces/Sync).
      exclude: seen,
    });
    for (const entry of setLayout.entries) {
      const key = `${entry.printKey}\0${entry.lang}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
    return writeCardVisualIndexIfChanged(
      {
        version: CARD_VISUAL_INDEX_VERSION,
        packId,
        lang: primaryLangLabel(merged, opts?.langs ?? langDirs),
        builtAt: new Date().toISOString(),
        entries: merged,
      },
      prior,
    ).file;
  }

  return buildCardVisualIndex({
    packId,
    printGame,
    lang: preferred || "en",
    limit: opts?.limit,
    alsoSetLangCard: true,
    setLangCardOnly: true,
    prior: prior?.entries ?? null,
  });
}
