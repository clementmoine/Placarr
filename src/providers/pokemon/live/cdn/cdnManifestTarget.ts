/**
 * CDN AssetManifest dump freshness — skip or resume when Rainier target is unchanged.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CDN_MANIFEST_TARGET_META = ".cdn-target.json";

export type CdnManifestTargetMeta = {
  version: string;
  contentDir: string;
  contentBase: string;
  langs: string[];
  dumpedAt: string;
  /** false = dump interrupted; omit/true = safe to reuse in full. */
  complete?: boolean;
  /** Sorted CDN buckets included in the dump (primary + dated epochs). */
  buckets?: string[];
};

export function cdnManifestTargetFingerprint(opts: {
  version: string;
  contentDir: string;
  contentBase: string;
  langs: readonly string[];
  buckets?: readonly string[];
}): string {
  const langs = [...opts.langs].map((l) => l.trim().toLowerCase()).filter(Boolean).sort();
  const buckets = [...(opts.buckets ?? [])]
    .map((b) => b.trim())
    .filter(Boolean)
    .sort();
  return [
    opts.version.trim(),
    opts.contentDir.trim(),
    opts.contentBase.trim().replace(/\/+$/, ""),
    langs.join(","),
    buckets.join(","),
  ].join("|");
}

export function readCdnManifestTargetMeta(
  outDir: string,
): CdnManifestTargetMeta | null {
  const file = path.join(outDir, CDN_MANIFEST_TARGET_META);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CdnManifestTargetMeta;
    if (
      typeof parsed.version !== "string" ||
      typeof parsed.contentDir !== "string" ||
      typeof parsed.contentBase !== "string" ||
      !Array.isArray(parsed.langs)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCdnManifestTargetMeta(
  outDir: string,
  meta: Omit<CdnManifestTargetMeta, "dumpedAt"> & {
    dumpedAt?: string;
    complete?: boolean;
    buckets?: readonly string[];
  },
): string {
  mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, CDN_MANIFEST_TARGET_META);
  const body: CdnManifestTargetMeta = {
    version: meta.version,
    contentDir: meta.contentDir,
    contentBase: meta.contentBase,
    langs: [...meta.langs],
    dumpedAt: meta.dumpedAt ?? new Date().toISOString(),
    complete: meta.complete !== false,
    buckets: meta.buckets ? [...meta.buckets] : undefined,
  };
  writeFileSync(dest, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return dest;
}

export function countCdnManifestJsonFiles(outDir: string): number {
  if (!existsSync(outDir)) return 0;
  return readdirSync(outDir).filter(
    (name) => name.startsWith("manifest_") && name.endsWith(".json"),
  ).length;
}

function fingerprintMatches(
  meta: CdnManifestTargetMeta,
  opts: {
    version: string;
    contentDir: string;
    contentBase: string;
    langs: readonly string[];
    buckets?: readonly string[];
  },
): boolean {
  return (
    cdnManifestTargetFingerprint({
      version: meta.version,
      contentDir: meta.contentDir,
      contentBase: meta.contentBase,
      langs: meta.langs,
      buckets: meta.buckets,
    }) === cdnManifestTargetFingerprint(opts)
  );
}

/**
 * Full skip — complete meta for this CDN target and at least one file per lang.
 */
export function shouldReuseCdnManifestDump(opts: {
  outDir: string;
  version: string;
  contentDir: string;
  contentBase: string;
  langs: readonly string[];
  buckets?: readonly string[];
}): boolean {
  const meta = readCdnManifestTargetMeta(opts.outDir);
  if (!meta || meta.complete === false) return false;
  if (!fingerprintMatches(meta, opts)) return false;
  return countCdnManifestJsonFiles(opts.outDir) >= Math.max(1, opts.langs.length);
}

/**
 * Partial dump for the same CDN target — refetch only missing manifest_*.json.
 * Also resumes legacy interrupts (dumps on disk, no meta yet).
 */
export function shouldResumeCdnManifestDump(opts: {
  outDir: string;
  version: string;
  contentDir: string;
  contentBase: string;
  langs: readonly string[];
  buckets?: readonly string[];
}): boolean {
  const files = countCdnManifestJsonFiles(opts.outDir);
  if (files === 0) return false;
  const meta = readCdnManifestTargetMeta(opts.outDir);
  if (!meta) return true;
  if (meta.complete !== false) return false;
  return fingerprintMatches(meta, opts);
}
