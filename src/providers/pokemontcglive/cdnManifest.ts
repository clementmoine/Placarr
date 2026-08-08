/**
 * Per-bucket UnityFS AssetManifest helpers (Rainier CDN).
 *
 * Official layout (verified via ptcgl.dev + Live client):
 *   ``{contentBase}{bucket}/manifest_{locale}_{bucket}``
 *
 * Parsing the UnityFS needs UnityPy (``scripts/pokemon/dump_cdn_manifest.py``).
 * This module stays Node-safe: URLs + name filtering for derive-then-intersect.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { DEFAULT_CONTENT_DIR } from "./cdn";
import { normalizeContentBase } from "./gameSettings";
import type { PokemonLiveLanguage } from "./languages";

/** Live CDN locale tags inside manifest filenames (ptbr, not pt-BR). */
export type ManifestLocale = PokemonLiveLanguage;

export const CARD_BUNDLE_NAME_RE =
  /^[a-z0-9.-]+_[a-z]{2,4}_\d{1,4}(_[a-z])?$/i;

export function assetManifestUrl(
  contentBase: string,
  bucket: string,
  locale: ManifestLocale,
): string {
  const base = normalizeContentBase(contentBase);
  const dir = bucket.trim() || DEFAULT_CONTENT_DIR;
  const lang = locale.trim().toLowerCase();
  return `${base}${dir}/manifest_${lang}_${dir}`;
}

export function isCardBundleAssetName(name: string): boolean {
  return CARD_BUNDLE_NAME_RE.test(name.trim());
}

/** Keep hi-res card bundles; drop ``_t`` thumbnails unless asked. */
export function filterCardBundleNames(
  assetNames: readonly string[],
  opts: { includeThumbnails?: boolean; langs?: readonly string[] } = {},
): string[] {
  const langs = opts.langs?.map((l) => l.toLowerCase()) ?? null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of assetNames) {
    const name = raw.trim();
    if (!isCardBundleAssetName(name)) continue;
    // ``set_lang_num_t`` thumbnails
    if (!opts.includeThumbnails && /_\d+_[a-z]$/i.test(name)) continue;
    if (langs) {
      const parts = name.split("_");
      const lang = parts[1]?.toLowerCase();
      if (!lang || !langs.includes(lang)) continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Derive-then-intersect: wanted stems ∩ manifest assets.
 * Returns names present in the manifest (authoritative CDN inventory).
 */
export function intersectWantedWithManifest(
  wanted: readonly string[],
  manifestAssets: readonly string[],
): { hit: string[]; miss: string[] } {
  const available = new Set(
    manifestAssets.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  const hit: string[] = [];
  const miss: string[] = [];
  const seen = new Set<string>();
  for (const raw of wanted) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (available.has(key)) hit.push(name);
    else miss.push(name);
  }
  return { hit, miss };
}

export type CdnManifestDump = {
  contentBase: string;
  bucket: string;
  locale: string;
  assetCount: number;
  assets: string[];
  source?: string;
};

export function loadCdnManifestDump(filePath: string): CdnManifestDump | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as CdnManifestDump;
    if (!Array.isArray(raw.assets)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeCdnManifestDump(
  filePath: string,
  dump: CdnManifestDump,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(dump, null, 2)}\n`, "utf8");
}

export function defaultManifestDumpPath(
  cacheRoot: string,
  bucket: string,
  locale: string,
): string {
  return path.join(
    cacheRoot,
    "cdn-manifests",
    `manifest_${locale}_${bucket}.json`,
  );
}
