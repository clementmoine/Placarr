/**
 * Which manifest version each downloaded bundle is at.
 *
 * The Live client re-downloads by comparing the manifest ``Hash128``
 * (``Caching.IsVersionCached`` → ``UnityWebRequestAssetBundle.GetAssetBundle``).
 * Our scrape used to skip on "file exists and is non-empty", so a bundle
 * re-issued upstream — corrected art, fixed foil mask, errata — was never
 * refetched and nothing on disk could reveal it.
 *
 * This ledger is that missing cache key.
 *
 * **Verified** = real CDN download (no ``assumed``). **Assumed** = on-disk
 * file adopted without a re-fetch. Assumed rows stay ``fresh`` (no re-download)
 * while the file exists; after extract OK they are promoted to verified so
 * ``purgeVerifiedCdnBundles`` can drop staging.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export const BUNDLE_LEDGER_VERSION = 1;

export type BundleLedgerEntry = {
  hash: string;
  bucket?: string | null;
  /** ISO timestamp of the download, or of the adoption. */
  at: string;
  /** True when the row was adopted rather than observed (see module doc). */
  assumed?: boolean;
};

export type BundleLedger = {
  version: number;
  contentBase?: string | null;
  entries: Record<string, BundleLedgerEntry>;
};

export function bundleLedgerPath(cacheRoot: string): string {
  // Durable under pack logs/. Fall back to legacy staging locations.
  const inLogs = path.join(cacheRoot, "logs", "cdn-bundle-versions.json.gz");
  const legacyRoot = path.join(cacheRoot, "cdn-bundle-versions.json.gz");
  const legacyStaging = path.join(
    cacheRoot,
    "staging",
    "cdn-bundle-versions.json.gz",
  );
  if (existsSync(inLogs)) return inLogs;
  if (existsSync(legacyStaging)) return legacyStaging;
  if (existsSync(legacyRoot)) return legacyRoot;
  return inLogs;
}

export function emptyBundleLedger(): BundleLedger {
  return { version: BUNDLE_LEDGER_VERSION, contentBase: null, entries: {} };
}

export function loadBundleLedger(cacheRoot: string): BundleLedger {
  const file = bundleLedgerPath(cacheRoot);
  if (!existsSync(file)) return emptyBundleLedger();
  try {
    const raw = JSON.parse(
      gunzipSync(readFileSync(file)).toString("utf8"),
    ) as BundleLedger;
    if (raw.version !== BUNDLE_LEDGER_VERSION || !raw.entries) {
      return emptyBundleLedger();
    }
    return raw;
  } catch {
    return emptyBundleLedger();
  }
}

export function saveBundleLedger(
  cacheRoot: string,
  ledger: BundleLedger,
): string {
  // Always write durable path under pack logs/.
  const file = path.join(cacheRoot, "logs", "cdn-bundle-versions.json.gz");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    gzipSync(Buffer.from(`${JSON.stringify(ledger)}\n`, "utf8"), { level: 9 }),
  );
  return file;
}

/**
 * After extract succeeded: drop staging bundles whose ledger hash is verified
 * (not merely ``assumed``). Next scrape skips re-download when freshness=fresh
 * even if the file is gone. Removes the directory when nothing remains.
 */
export function purgeVerifiedCdnBundles(
  cacheRoot: string,
  bundlesDir: string,
): { purged: number; kept: number; removedDir?: boolean } {
  if (!existsSync(bundlesDir)) return { purged: 0, kept: 0 };
  const ledger = loadBundleLedger(cacheRoot);
  let purged = 0;
  let kept = 0;
  for (const name of readdirSync(bundlesDir)) {
    const abs = path.join(bundlesDir, name);
    try {
      if (!statSync(abs).isFile()) {
        kept += 1;
        continue;
      }
    } catch {
      continue;
    }
    const row = ledger.entries[name.toLowerCase()];
    if (row?.hash && !row.assumed) {
      try {
        unlinkSync(abs);
        purged += 1;
      } catch {
        kept += 1;
      }
    } else {
      kept += 1;
    }
  }
  return {
    purged,
    kept,
    removedDir: removeDirIfEmpty(bundlesDir),
  };
}

/** Drop a staging dir that has no remaining files (ignore ``.DS_Store``). */
export function removeDirIfEmpty(dir: string): boolean {
  if (!existsSync(dir)) return false;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (name === ".DS_Store") {
      try {
        unlinkSync(path.join(dir, name));
      } catch {
        return false;
      }
      continue;
    }
    return false;
  }
  try {
    rmdirSync(dir);
    return true;
  } catch {
    return false;
  }
}

export type BundleFreshness = "fresh" | "stale" | "unknown";

/**
 * ``unknown`` — no expected hash (catalogue not in play) or no ledger row yet.
 * ``stale`` — hash moved upstream (re-download). Matching hash is ``fresh``
 * even for legacy ``assumed`` rows — on-disk bytes are reused, never re-fetched
 * solely to clear ``assumed``.
 */
export function bundleFreshness(
  ledger: BundleLedger,
  name: string,
  expectedHash: string | null | undefined,
): BundleFreshness {
  if (!expectedHash) return "unknown";
  const row = ledger.entries[name.toLowerCase()];
  if (!row?.hash) return "unknown";
  return row.hash === expectedHash ? "fresh" : "stale";
}

/**
 * After extract succeeded: drop the ``assumed`` flag so staging purge can
 * remove on-disk bundles that were only adopted (local file reused, treatments
 * done). Does not touch hashes.
 */
export function promoteAssumedBundlesToVerified(
  cacheRoot: string,
): { promoted: number } {
  const ledger = loadBundleLedger(cacheRoot);
  let promoted = 0;
  for (const row of Object.values(ledger.entries)) {
    if (row.assumed) {
      delete row.assumed;
      promoted += 1;
    }
  }
  if (promoted > 0) saveBundleLedger(cacheRoot, ledger);
  return { promoted };
}

export function recordBundleVersion(
  ledger: BundleLedger,
  name: string,
  hash: string | null | undefined,
  opts: { bucket?: string | null; assumed?: boolean } = {},
): void {
  if (!hash) return;
  ledger.entries[name.toLowerCase()] = {
    hash,
    bucket: opts.bucket ?? null,
    at: new Date().toISOString(),
    ...(opts.assumed ? { assumed: true } : {}),
  };
}
