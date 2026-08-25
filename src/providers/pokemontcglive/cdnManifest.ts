/**
 * Per-bucket UnityFS AssetManifest helpers (Rainier CDN).
 *
 * Official layout (verified via ptcgl.dev + Live client):
 *   ``{contentBase}{bucket}/manifest_{locale}_{bucket}``
 *
 * Parsing: Node ``@/lib/unity`` (ADR-021 phase A). Python
 * ``unity/dump_cdn_manifest.py`` remains an oracle / ``PLACARR_UNITY_PYTHON=1``.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { DEFAULT_CONTENT_DIR } from "./cdn";
import { normalizeContentBase } from "./gameSettings";
import type { PokemonLiveLanguage } from "./languages";

/** Live CDN locale tags inside manifest filenames (ptbr, not pt-BR). */
export type ManifestLocale = PokemonLiveLanguage;

export const CARD_BUNDLE_NAME_RE = /^[a-z0-9.-]+_[a-z]{2,4}_\d{1,4}(_[a-z])?$/i;

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

/** One ``assetList`` row: ``crc`` lets a refresh skip unchanged bundles. */
export type ManifestAssetEntry = {
  name: string;
  crc?: number | null;
  hash?: string | null;
  dependencies?: string[];
};

export type CdnManifestDump = {
  contentBase: string;
  bucket: string;
  locale: string;
  assetCount: number;
  assets: string[];
  /** Present on dumps written after the multi-bucket rewrite. */
  entries?: ManifestAssetEntry[];
  source?: string;
};

/**
 * Authoritative catalogue across every dumped bucket: which bundles exist,
 * and — the part the scrape needs — which bucket serves each one, so a GET
 * never has to walk the dated dirs looking for it.
 */
export type CdnCatalogue = {
  /** Card-bundle names (deduped, ``_t`` thumbnails excluded). */
  names: string[];
  /** ``bundle name`` (lowercased) → content dir that serves it. */
  bucketOf: Map<string, string>;
  crcOf: Map<string, number>;
  /** Manifest ``hash`` — the client's cache key, so ours too. */
  hashOf: Map<string, string>;
  buckets: string[];
  locales: string[];
  /** Every assetName seen, cards or not — for coverage reporting. */
  assetCount: number;
};

export function emptyCdnCatalogue(): CdnCatalogue {
  return {
    names: [],
    bucketOf: new Map(),
    crcOf: new Map(),
    hashOf: new Map(),
    buckets: [],
    locales: [],
    assetCount: 0,
  };
}

/**
 * Merge dumps into one catalogue. When a bundle appears in several buckets
 * the **last** dump wins, so callers should feed buckets oldest-first and let
 * the freshest epoch override (that is how the client resolves them too).
 */
export function buildCdnCatalogue(
  dumps: readonly CdnManifestDump[],
  opts: { langs?: readonly string[]; includeThumbnails?: boolean } = {},
): CdnCatalogue {
  const bucketOf = new Map<string, string>();
  const crcOf = new Map<string, number>();
  const hashOf = new Map<string, string>();
  const names: string[] = [];
  const seen = new Set<string>();
  const buckets: string[] = [];
  const locales: string[] = [];
  let assetCount = 0;

  const ordered = [...dumps].sort((a, b) =>
    a.bucket === b.bucket ? 0 : a.bucket < b.bucket ? -1 : 1,
  );

  for (const dump of ordered) {
    if (!buckets.includes(dump.bucket)) buckets.push(dump.bucket);
    if (!locales.includes(dump.locale)) locales.push(dump.locale);
    assetCount += dump.assets.length;

    const kept = new Set(
      filterCardBundleNames(dump.assets, {
        langs: opts.langs,
        includeThumbnails: opts.includeThumbnails,
      }).map((n) => n.toLowerCase()),
    );
    const crcByName = new Map<string, number>();
    const hashByName = new Map<string, string>();
    for (const entry of dump.entries ?? []) {
      const key = entry.name.toLowerCase();
      if (typeof entry.crc === "number") crcByName.set(key, entry.crc);
      if (entry.hash) hashByName.set(key, entry.hash);
    }

    for (const raw of dump.assets) {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (!kept.has(key)) continue;
      bucketOf.set(key, dump.bucket);
      const crc = crcByName.get(key);
      if (crc != null) crcOf.set(key, crc);
      const hash = hashByName.get(key);
      if (hash) hashOf.set(key, hash);
      if (!seen.has(key)) {
        seen.add(key);
        names.push(name);
      }
    }
  }

  names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return { names, bucketOf, crcOf, hashOf, buckets, locales, assetCount };
}

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
