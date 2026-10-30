/**
 * Scryfall CDN face ledger — written at seed (`curated/art-urls.json`).
 * Local `print_assets.art` filenames win when present; otherwise browse /
 * print search fall back to these durable CDN URLs.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { MTG_PACK_ID } from "./pack";

/** printKey → lang → CDN face URL */
export type MtgArtUrlMap = Record<string, Record<string, string>>;

export type MtgArtUrlResolve = {
  url: string;
  /** Lang slot the URL was stored under (may differ from the tile lang). */
  artLang: string;
};

type Cache = { mtimeMs: number; map: MtgArtUrlMap };

let cache: Cache | null = null;

export function artUrlsPath(): string {
  return path.join(
    process.cwd(),
    "data",
    MTG_PACK_ID,
    "curated",
    "art-urls.json",
  );
}

export function artUrlsMtimeMs(): number {
  const file = artUrlsPath();
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** printKey → lang → Scryfall `normal` face URL. */
export function loadMtgArtUrlMap(): MtgArtUrlMap {
  const file = artUrlsPath();
  const mtimeMs = artUrlsMtimeMs();
  if (cache && cache.mtimeMs === mtimeMs) return cache.map;
  if (!existsSync(file)) {
    cache = { mtimeMs: 0, map: {} };
    return cache.map;
  }
  try {
    const map = JSON.parse(readFileSync(file, "utf8")) as MtgArtUrlMap;
    cache = { mtimeMs, map };
    return map;
  } catch {
    cache = { mtimeMs: 0, map: {} };
    return cache.map;
  }
}

/**
 * Prefer `preferLang`, then EN (oracle), then FR, then any remaining slot.
 * Matches catalogue borrowFaceAcrossLocales for missing lang-specific faces.
 * Scryfall `errors.scryfall.com/soon.jpg` placeholders are not real faces —
 * skip them so FR tiles fall back to EN art.
 */
export function isUsableMtgArtUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim() ?? "";
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  if (/errors\.scryfall\.com/i.test(trimmed)) return false;
  if (/\/soon\.jpe?g(\?|$)/i.test(trimmed)) return false;
  return true;
}

export function resolveMtgArtUrl(
  map: MtgArtUrlMap,
  printKey: string,
  preferLang?: string | null,
): MtgArtUrlResolve | null {
  const byLang = map[printKey.trim()];
  if (!byLang || typeof byLang !== "object") return null;
  const prefer = (preferLang ?? "").trim().toLowerCase();
  const order = [
    prefer,
    "en",
    "fr",
    ...Object.keys(byLang).map((l) => l.trim().toLowerCase()),
  ].filter(Boolean);
  const seen = new Set<string>();
  for (const lang of order) {
    if (seen.has(lang)) continue;
    seen.add(lang);
    const url = byLang[lang]?.trim();
    if (isUsableMtgArtUrl(url)) return { url: url!, artLang: lang };
  }
  return null;
}

/** Test seam. */
export function clearMtgArtUrlCache(): void {
  cache = null;
}
