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
 * **Adoption caveat.** A bundle with no ledger entry counts as fresh and is
 * adopted at the catalogue's current hash, flagged ``assumed``. Without that,
 * the first run after this shipped would re-download every file already on
 * disk. Adopted rows assert nothing about what is actually stored; only rows
 * written by a real download are verified.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  return path.join(cacheRoot, "cdn-bundle-versions.json.gz");
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
  const file = bundleLedgerPath(cacheRoot);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    gzipSync(Buffer.from(`${JSON.stringify(ledger)}\n`, "utf8"), { level: 9 }),
  );
  return file;
}

export type BundleFreshness = "fresh" | "stale" | "unknown";

/**
 * ``unknown`` — no expected hash (catalogue not in play) or no ledger row yet;
 * callers treat it as fresh and adopt. ``stale`` is the only refetch signal.
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
