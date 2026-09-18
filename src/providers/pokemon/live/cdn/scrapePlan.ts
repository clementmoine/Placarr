/**
 * Scrape plan / ledger helpers (ptcgl.dev-inspired).
 *
 * - Persist CloudFront soft-ban cooldown across runs
 * - Skip stems already logged as CDN-unavailable (honest miss)
 * - Intersect wanted stems with on-disk CDN AssetManifest dumps when present
 * - Single-process lock file for CDN scrape
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/*
  Soft-ban state is shared with the other packs that scrape a rate-limiting
  host — see `providers/shared/softban`. Re-exported so this module keeps the
  surface its callers already use.
*/
export {
  clearSoftbanState,
  readSoftbanState,
  recordSoftbanFailure,
  softbanAllows,
  softbanCircuitState,
  softbanRemainingMs,
  softbanStatePath,
  writeSoftbanState,
  type SoftbanState,
} from "@/providers/shared/softban";

import {
  readSoftbanState,
  softbanRemainingMs,
} from "@/providers/shared/softban";

import {
  buildCdnCatalogue,
  emptyCdnCatalogue,
  intersectWantedWithManifest,
  loadCdnManifestDump,
  type CdnCatalogue,
  type CdnManifestDump,
} from "./cdnManifest";

export type ScrapePlan = {
  names: string[];
  extras: string[];
  deferredKnownMiss: string[];
  notInManifest: string[];
  usedManifest: boolean;
  softbanUntil: string | null;
  softbanBlocked: boolean;
};

function logsDir(cacheRoot: string): string {
  return path.join(cacheRoot, "logs");
}

export function scrapeLockPath(cacheRoot: string): string {
  return path.join(logsDir(cacheRoot), "cdn-scrape.lock");
}

export function knownCdnMissPath(cacheRoot: string): string {
  return path.join(logsDir(cacheRoot), "cdn-unavailable-stems.txt");
}

export function loadKnownCdnMisses(cacheRoot: string): Set<string> {
  const p = knownCdnMissPath(cacheRoot);
  if (!existsSync(p)) return new Set();
  const out = new Set<string>();
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const s = line.trim().toLowerCase();
    if (s && !s.startsWith("#")) out.add(s);
  }
  return out;
}

/**
 * Load union of card-bundle asset names from dumped manifests under
 * ``cacheRoot/cdn-manifests/`` for the requested langs (+ optional bucket).
 */
export function loadCdnManifestDumps(
  cacheRoot: string,
  opts: { langs: readonly string[] },
): CdnManifestDump[] {
  const dir = path.join(cacheRoot, "cdn-manifests");
  if (!existsSync(dir)) return [];
  const langs = new Set(opts.langs.map((l) => l.toLowerCase()));
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const dumps: CdnManifestDump[] = [];
  for (const name of files) {
    if (!name.startsWith("manifest_") || !name.endsWith(".json")) continue;
    const dump = loadCdnManifestDump(path.join(dir, name));
    if (!dump) continue;
    if (!langs.has(dump.locale.toLowerCase())) continue;
    dumps.push(dump);
  }
  return dumps;
}

/**
 * Full catalogue across **every** dumped bucket — the authoritative list of
 * what the CDN serves, plus each bundle's bucket.
 */
export function loadCdnCatalogue(
  cacheRoot: string,
  opts: { langs: readonly string[]; includeThumbnails?: boolean },
): CdnCatalogue {
  const dumps = loadCdnManifestDumps(cacheRoot, opts);
  if (!dumps.length) return emptyCdnCatalogue();
  return buildCdnCatalogue(dumps, {
    langs: opts.langs,
    includeThumbnails: opts.includeThumbnails,
  });
}

/**
 * Card-bundle names known to the CDN, unioned over all buckets.
 * ``null`` when no dump exists (callers then skip the intersect).
 */
export function loadManifestAssetUnion(
  cacheRoot: string,
  opts: { langs: readonly string[]; bucket?: string },
): string[] | null {
  const catalogue = loadCdnCatalogue(cacheRoot, { langs: opts.langs });
  if (!catalogue.names.length) return null;
  return catalogue.names;
}

export type AcquireScrapeLockResult =
  | { ok: true; path: string }
  | { ok: false; holderPid: number | null; path: string };

/** Best-effort single-process lock (ptcgl.dev Forbid concurrency). */
export function tryAcquireScrapeLock(
  cacheRoot: string,
  pid = process.pid,
): AcquireScrapeLockResult {
  mkdirSync(logsDir(cacheRoot), { recursive: true });
  const lockPath = scrapeLockPath(cacheRoot);
  if (existsSync(lockPath)) {
    let holder: number | null = null;
    try {
      const raw = JSON.parse(readFileSync(lockPath, "utf8")) as {
        pid?: number;
      };
      holder = typeof raw.pid === "number" ? raw.pid : null;
    } catch {
      holder = null;
    }
    if (holder != null && holder !== pid) {
      try {
        process.kill(holder, 0);
        return { ok: false, holderPid: holder, path: lockPath };
      } catch {
        /* stale lock */
      }
    }
  }
  writeFileSync(
    lockPath,
    `${JSON.stringify({ pid, at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return { ok: true, path: lockPath };
}

export function releaseScrapeLock(cacheRoot: string, pid = process.pid): void {
  const lockPath = scrapeLockPath(cacheRoot);
  if (!existsSync(lockPath)) return;
  try {
    const raw = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number };
    if (raw.pid != null && raw.pid !== pid) return;
  } catch {
    /* remove anyway if ours */
  }
  try {
    unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

/**
 * Build the CDN GET list: extras + wanted, minus known misses, optionally
 * intersected with dumped AssetManifests (derive-then-intersect).
 */
export function planScrapeNames(opts: {
  cacheRoot: string;
  wanted: readonly string[];
  extras?: readonly string[];
  langs: readonly string[];
  contentDir?: string;
  /** Skip stems in logs/cdn-unavailable-stems.txt (default true). */
  skipKnownMisses?: boolean;
  /** Force retry of previously logged CDN misses. */
  retryCdnMisses?: boolean;
  /** When false, never intersect manifests even if dumps exist. */
  useManifestIntersect?: boolean;
}): ScrapePlan {
  const extras = [...(opts.extras ?? [])].map((s) => s.trim()).filter(Boolean);
  const skipKnown =
    opts.retryCdnMisses === true ? false : opts.skipKnownMisses !== false;
  const knownMiss = skipKnown ? loadKnownCdnMisses(opts.cacheRoot) : new Set();
  const deferredKnownMiss: string[] = [];
  const wanted: string[] = [];
  const seen = new Set<string>();

  for (const raw of opts.wanted) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (knownMiss.has(key)) {
      deferredKnownMiss.push(name);
      continue;
    }
    wanted.push(name);
  }

  let notInManifest: string[] = [];
  let usedManifest = false;
  let scrapeWanted = wanted;
  if (opts.useManifestIntersect !== false) {
    const union = loadManifestAssetUnion(opts.cacheRoot, {
      langs: opts.langs,
      bucket: opts.contentDir,
    });
    if (union && union.length) {
      usedManifest = true;
      const { hit, miss } = intersectWantedWithManifest(wanted, union);
      scrapeWanted = hit;
      notInManifest = miss;
    }
  }

  const remaining = softbanRemainingMs(opts.cacheRoot);
  const softbanUntil =
    remaining > 0 ? (readSoftbanState(opts.cacheRoot)?.until ?? null) : null;

  return {
    names: [...extras, ...scrapeWanted],
    extras,
    deferredKnownMiss,
    notInManifest,
    usedManifest,
    softbanUntil,
    softbanBlocked: remaining > 0,
  };
}
