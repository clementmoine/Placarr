/**
 * Compact CDN catalogue under ``logs/`` — survives ``staging/cdn-manifests`` purge.
 *
 * Sync suivant : même fingerprint → load hashOf/bucketOf sans re-dumper les manifests.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  emptyCdnCatalogue,
  type CdnCatalogue,
} from "./cdnManifest";

export const DURABLE_CDN_CATALOGUE_VERSION = 1;
export const DURABLE_CDN_CATALOGUE_FILE = "cdn-catalogue-hashof.json.gz";

export type DurableCdnCatalogue = {
  version: number;
  fingerprint: string;
  names: string[];
  hashOf: Record<string, string>;
  bucketOf: Record<string, string>;
  buckets: string[];
  locales: string[];
  assetCount: number;
  savedAt: string;
};

export function durableCdnCataloguePath(cacheRoot: string): string {
  return path.join(cacheRoot, "logs", DURABLE_CDN_CATALOGUE_FILE);
}

export function serializeCdnCatalogue(
  catalogue: CdnCatalogue,
  fingerprint: string,
  now = new Date(),
): DurableCdnCatalogue {
  const hashOf: Record<string, string> = {};
  for (const [k, v] of catalogue.hashOf) hashOf[k] = v;
  const bucketOf: Record<string, string> = {};
  for (const [k, v] of catalogue.bucketOf) bucketOf[k] = v;
  return {
    version: DURABLE_CDN_CATALOGUE_VERSION,
    fingerprint,
    names: [...catalogue.names],
    hashOf,
    bucketOf,
    buckets: [...catalogue.buckets],
    locales: [...catalogue.locales],
    assetCount: catalogue.assetCount,
    savedAt: now.toISOString(),
  };
}

export function durableToCdnCatalogue(raw: DurableCdnCatalogue): CdnCatalogue {
  return {
    names: [...raw.names],
    hashOf: new Map(Object.entries(raw.hashOf)),
    bucketOf: new Map(Object.entries(raw.bucketOf)),
    crcOf: new Map(),
    buckets: [...raw.buckets],
    locales: [...raw.locales],
    assetCount: raw.assetCount,
  };
}

export function saveDurableCdnCatalogue(
  cacheRoot: string,
  catalogue: CdnCatalogue,
  fingerprint: string,
): string {
  const file = durableCdnCataloguePath(cacheRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  const body = serializeCdnCatalogue(catalogue, fingerprint);
  writeFileSync(
    file,
    gzipSync(Buffer.from(`${JSON.stringify(body)}\n`, "utf8"), { level: 9 }),
  );
  return file;
}

export function loadDurableCdnCatalogue(
  cacheRoot: string,
): DurableCdnCatalogue | null {
  const file = durableCdnCataloguePath(cacheRoot);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(
      gunzipSync(readFileSync(file)).toString("utf8"),
    ) as DurableCdnCatalogue;
    if (
      raw.version !== DURABLE_CDN_CATALOGUE_VERSION ||
      typeof raw.fingerprint !== "string" ||
      !raw.hashOf ||
      !Array.isArray(raw.names)
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** When staging manifests are gone, rebuild catalogue from durable logs. */
export function loadCdnCatalogueFromDurable(
  cacheRoot: string,
  fingerprint?: string | null,
): CdnCatalogue {
  const raw = loadDurableCdnCatalogue(cacheRoot);
  if (!raw) return emptyCdnCatalogue();
  if (fingerprint && raw.fingerprint !== fingerprint) return emptyCdnCatalogue();
  return durableToCdnCatalogue(raw);
}
