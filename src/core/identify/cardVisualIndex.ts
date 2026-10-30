/**
 * Offline visual index for cardboard ID (camera / photo → printKey).
 *
 * MVP: dHash 64-bit over pack face trees. Match is top‑k + user confirm —
 * never auto-accept. Locale-specific faces stay scoped to the indexed lang.
 * Pack / printGame are always caller-supplied — no provider defaults in core.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

export { dHashFromBuffer };

export function cardVisualIndexPath(packId: string): string {
  return path.join(packDataDir(packId), INDEX_NAME);
}

export function loadCardVisualIndex(
  packId: string,
): CardVisualIndexFile | null {
  const file = cardVisualIndexPath(packId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CardVisualIndexFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
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
  return dHashFromBuffer(readFileSync(filePath));
}

function listArtFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) =>
    /^art(\.|$)/i.test(name) && /\.(webp|jpg|jpeg|png)$/i.test(name),
  );
}

/**
 * Walk `data/<pack>/cards/<lang>/<set>/<card>/art*` and write the index.
 * `printGame` is required — printKey prefix must come from the owning provider.
 */
export async function buildCardVisualIndex(opts: {
  packId: string;
  printGame: string;
  lang?: string;
  limit?: number;
}): Promise<CardVisualIndexFile> {
  const lang = (opts.lang ?? "fr").toLowerCase();
  const printGame = opts.printGame.trim();
  if (!printGame) {
    throw new Error("buildCardVisualIndex: printGame is required");
  }
  const cardsRoot = path.join(packDataDir(opts.packId), "cards", lang);
  const entries: CardVisualIndexEntry[] = [];
  if (!existsSync(cardsRoot)) {
    const empty: CardVisualIndexFile = {
      version: 1,
      packId: opts.packId,
      lang,
      builtAt: new Date().toISOString(),
      entries: [],
    };
    writeFileSync(cardVisualIndexPath(opts.packId), JSON.stringify(empty));
    return empty;
  }

  const sets = readdirSync(cardsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const set of sets) {
    if (opts.limit != null && entries.length >= opts.limit) break;
    const setDir = path.join(cardsRoot, set);
    const cards = readdirSync(setDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const card of cards) {
      if (opts.limit != null && entries.length >= opts.limit) break;
      const cardDir = path.join(setDir, card);
      const arts = listArtFiles(cardDir);
      if (!arts.length) continue;
      // Prefer highest-ranked face name order: art.webp then art.*.webp
      const artName =
        arts.find((n) => n.toLowerCase() === "art.webp") ??
        arts.find((n) => n.toLowerCase().startsWith("art.")) ??
        arts[0]!;
      const hash = await dHashFromFile(path.join(cardDir, artName));
      if (!hash) continue;
      entries.push({
        printKey: `${printGame}:${set}-${card}`,
        lang,
        set,
        card,
        artRel: path.join("cards", lang, set, card, artName),
        hash,
      });
    }
  }

  const file: CardVisualIndexFile = {
    version: 1,
    packId: opts.packId,
    lang,
    builtAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(cardVisualIndexPath(opts.packId), JSON.stringify(file));
  return file;
}

export type CardVisualMatch = {
  printKey: string;
  lang: string;
  distance: number;
  artRel: string;
  packId?: string;
};

/** Top‑k nearest dHash neighbours. Caller must confirm — never auto-accept. */
export function matchCardVisualHash(
  hash: string,
  index: CardVisualIndexFile,
  opts?: { limit?: number; maxDistance?: number },
): CardVisualMatch[] {
  const limit = opts?.limit ?? 5;
  const maxDistance = opts?.maxDistance ?? 14;
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
  scored.sort((a, b) => a.distance - b.distance || a.printKey.localeCompare(b.printKey));
  return scored.slice(0, limit);
}

/** Match against every on-disk visual index (pack-agnostic MVP). */
export function matchCardVisualHashAcrossPacks(
  hash: string,
  opts?: { limit?: number; maxDistance?: number; packIds?: string[] },
): CardVisualMatch[] {
  const packIds = opts?.packIds ?? listCardVisualIndexPackIds();
  const limit = opts?.limit ?? 5;
  const scored: CardVisualMatch[] = [];
  for (const packId of packIds) {
    const index = loadCardVisualIndex(packId);
    if (!index?.entries.length) continue;
    scored.push(
      ...matchCardVisualHash(hash, index, {
        limit,
        maxDistance: opts?.maxDistance,
      }),
    );
  }
  scored.sort((a, b) => a.distance - b.distance || a.printKey.localeCompare(b.printKey));
  return scored.slice(0, limit);
}
