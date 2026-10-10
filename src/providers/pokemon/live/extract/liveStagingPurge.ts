/**
 * Post-sync Live staging lifecycle — promote → ledger → purge caches.
 *
 * No permanent digs: Malie + CDN epoch probe cover cold-start without ADB.
 * @see docs/catalogue_contract.md
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";

import {
  cdnManifestTargetFingerprint,
  readCdnManifestTargetMeta,
} from "../cdn/cdnManifestTarget";
import { saveDurableCdnCatalogue } from "../cdn/durableCdnCatalogue";
import {
  MALIE_BUNDLE_STEMS,
  MALIE_CACHE_META,
  MALIE_CATALOGUE_SETNUM,
  MALIE_IDENTITIES_CACHE,
  malieDurableDir,
  readMalieCacheMeta,
} from "../cdn/malie";
import type { CdnCatalogue } from "../cdn/cdnManifest";
import { isSharedCdnAssetName } from "../cdn/cdnManifest";
import {
  loadBundleLedger,
  promoteAssumedBundlesToVerified,
  purgeVerifiedCdnBundles,
  recordBundleVersion,
  removeDirIfEmpty,
  saveBundleLedger,
} from "./bundleLedger";

export const POKEMON_CDN_MANIFESTS_ARTEFACT = "pokemon:cdn-manifests";
export const POKEMON_MALIE_DBS_ARTEFACT = "pokemon:malie-databases";
export const POKEMON_BASE_APK_ARTEFACT = "pokemon:base-apk";

/** @deprecated Empty — Live staging has no permanent digs after cold-start path. */
export const POKEMON_STAGING_DIG_DIRS = [] as const;

export const APK_STORE_META_FILE = "apk-store-meta.json";

export type PromoteLiveStagingResult = {
  cdnBundles: { purged: number; kept: number; promoted: number };
  manifests: boolean;
  malieDatabases: boolean;
  apks: { purgedApks: number; keptMeta: boolean };
  configCachePurged: boolean;
  orphans: number;
  durableCatalogue: boolean;
};

function copyIfMissing(src: string, dest: string): void {
  if (!existsSync(src) || existsSync(dest)) return;
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src));
}

function copyOverwrite(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src));
}

/** Ensure Malie inventory is under logs/ before purging staging DBs. */
export function ensureMalieInventoryDurable(stagingDir: string): void {
  const durable = malieDurableDir(stagingDir);
  mkdirSync(durable, { recursive: true });
  for (const name of [
    MALIE_IDENTITIES_CACHE,
    MALIE_CACHE_META,
    MALIE_BUNDLE_STEMS,
    MALIE_CATALOGUE_SETNUM,
  ]) {
    copyIfMissing(path.join(stagingDir, name), path.join(durable, name));
  }
}

/** Staging → logs for APK store version meta (skip re-DL after purge). */
export function ensureApkStoreMetaDurable(
  stagingDir: string,
  cacheRoot: string,
): boolean {
  const stagingMeta = path.join(stagingDir, "apks", APK_STORE_META_FILE);
  const durableMeta = path.join(cacheRoot, "logs", APK_STORE_META_FILE);
  if (existsSync(stagingMeta)) {
    copyOverwrite(stagingMeta, durableMeta);
  }
  return existsSync(durableMeta);
}

/**
 * Record shared UnityFS hashes from the catalogue so purge can drop
 * shadersbundle / attack_* after extract OK.
 */
export function recordSharedBundlesFromCatalogue(
  cacheRoot: string,
  catalogue: CdnCatalogue | null | undefined,
): number {
  if (!catalogue?.hashOf.size) return 0;
  const ledger = loadBundleLedger(cacheRoot);
  let n = 0;
  for (const [name, hash] of catalogue.hashOf) {
    if (!isSharedCdnAssetName(name) || !hash) continue;
    const key = name.toLowerCase();
    const existing = ledger.entries[key];
    if (existing?.hash === hash && !existing.assumed) continue;
    recordBundleVersion(ledger, name, hash, {
      bucket: catalogue.bucketOf.get(key) ?? null,
      assumed: Boolean(existing?.assumed),
    });
    n += 1;
  }
  if (n > 0) saveBundleLedger(cacheRoot, ledger);
  return n;
}

/** Drop last-scrape / .bak leftovers that are never ledgered. */
export function purgeCdnBundleOrphans(bundlesDir: string): number {
  if (!existsSync(bundlesDir)) return 0;
  let n = 0;
  for (const name of readdirSync(bundlesDir)) {
    const abs = path.join(bundlesDir, name);
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    const lower = name.toLowerCase();
    if (
      lower === "last-scrape.json" ||
      lower.endsWith(".bak") ||
      lower.endsWith(".pre-me5.bak")
    ) {
      try {
        unlinkSync(abs);
        n += 1;
      } catch {
        /* keep */
      }
    }
  }
  return n;
}

/**
 * Purge staging APK binaries + meta (meta must already be durable under logs/).
 */
export function purgeStagingApkBinaries(apksDir: string): {
  purgedApks: number;
  keptMeta: boolean;
} {
  if (!existsSync(apksDir)) return { purgedApks: 0, keptMeta: false };
  let purgedApks = 0;
  for (const name of readdirSync(apksDir)) {
    const abs = path.join(apksDir, name);
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    if (name.toLowerCase().endsWith(".apk") || name === APK_STORE_META_FILE) {
      try {
        unlinkSync(abs);
        if (name.toLowerCase().endsWith(".apk")) purgedApks += 1;
      } catch {
        /* keep */
      }
    }
  }
  removeDirIfEmpty(apksDir);
  return { purgedApks, keptMeta: false };
}

/** Drop optional ADB config-cache after successful promote (cold-start OK). */
export function purgeStagingConfigCache(stagingDir: string): boolean {
  const dig = path.join(stagingDir, "config-cache");
  if (!existsSync(dig)) return false;
  try {
    rmSync(dig, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * After successful Live sync: durable catalogue + promote/purge caches.
 * Staging empties for Live caches (Malie / CDN / APK / config-cache).
 */
export function promoteAndPurgeLiveStaging(opts: {
  packId?: string;
  cacheRoot: string;
  stagingDir: string;
  catalogue?: CdnCatalogue | null;
  /** CDN target fingerprint for durable catalogue + manifests ledger. */
  manifestFingerprint?: string | null;
  /** Store versionCode string for APK ledger (optional). */
  apkVersionHash?: string | null;
  /** Override ingest ledger path (tests). Default: pack logs. */
  ledgerPath?: string;
}): PromoteLiveStagingResult {
  const packId = opts.packId ?? "pokemon";
  const ledgerPath =
    opts.ledgerPath ?? packCatalogIngestLedgerPath(packId);
  const bundlesDir = path.join(opts.stagingDir, "cdn-bundles");
  const manifestsDir = path.join(opts.stagingDir, "cdn-manifests");
  const malieDbDir = path.join(opts.stagingDir, "malie-databases");
  const apksDir = path.join(opts.stagingDir, "apks");

  recordSharedBundlesFromCatalogue(opts.cacheRoot, opts.catalogue);
  const promoted = promoteAssumedBundlesToVerified(opts.cacheRoot);
  const cdnBundles = {
    ...purgeVerifiedCdnBundles(opts.cacheRoot, bundlesDir),
    promoted: promoted.promoted,
  };
  const orphans = purgeCdnBundleOrphans(bundlesDir);
  removeDirIfEmpty(bundlesDir);

  let durableCatalogue = false;
  const fp =
    opts.manifestFingerprint ??
    (() => {
      const meta = readCdnManifestTargetMeta(manifestsDir);
      if (!meta) return null;
      return cdnManifestTargetFingerprint({
        version: meta.version,
        contentDir: meta.contentDir,
        contentBase: meta.contentBase,
        langs: meta.langs,
        buckets: meta.buckets,
      });
    })();

  if (opts.catalogue && opts.catalogue.names.length && fp) {
    saveDurableCdnCatalogue(opts.cacheRoot, opts.catalogue, fp);
    durableCatalogue = true;
    recordCatalogPromoteAndPurgeStaging({
      ledgerPath,
      artefactId: POKEMON_CDN_MANIFESTS_ARTEFACT,
      contentHash: fp,
      stagingPath: manifestsDir,
    });
  }

  ensureMalieInventoryDurable(opts.stagingDir);
  const malieMeta = readMalieCacheMeta(opts.stagingDir);
  let malieDatabases = false;
  if (malieMeta?.fingerprint) {
    recordCatalogPromoteAndPurgeStaging({
      ledgerPath,
      artefactId: POKEMON_MALIE_DBS_ARTEFACT,
      contentHash: malieMeta.fingerprint,
      stagingPath: malieDbDir,
    });
    malieDatabases = true;
    // Staging copies of inventory are redundant once logs/ holds them.
    for (const name of [
      MALIE_IDENTITIES_CACHE,
      MALIE_CACHE_META,
      MALIE_BUNDLE_STEMS,
      MALIE_CATALOGUE_SETNUM,
      "malie-bootstrap-report.json",
      "cdn-bundle-versions.json.gz",
    ]) {
      const abs = path.join(opts.stagingDir, name);
      if (existsSync(abs)) {
        try {
          unlinkSync(abs);
        } catch {
          /* keep */
        }
      }
    }
  }

  const durableApkMeta = ensureApkStoreMetaDurable(
    opts.stagingDir,
    opts.cacheRoot,
  );
  let apkHash = opts.apkVersionHash;
  if (!apkHash && durableApkMeta) {
    try {
      const meta = JSON.parse(
        readFileSync(
          path.join(opts.cacheRoot, "logs", APK_STORE_META_FILE),
          "utf8",
        ),
      ) as { versionCode?: number };
      if (typeof meta.versionCode === "number") {
        apkHash = `versionCode:${meta.versionCode}`;
      }
    } catch {
      /* ignore */
    }
  }
  if (apkHash) {
    recordCatalogPromoteAndPurgeStaging({
      ledgerPath,
      artefactId: POKEMON_BASE_APK_ARTEFACT,
      contentHash: apkHash,
      stagingPath: path.join(apksDir, "__purge_placeholder__"),
      purge: false,
    });
  }
  const apks = {
    ...purgeStagingApkBinaries(apksDir),
    keptMeta: durableApkMeta,
  };

  const configCachePurged = purgeStagingConfigCache(opts.stagingDir);

  // Stale legacy ledger under staging (canonical is logs/).
  const legacyLedger = path.join(opts.stagingDir, "cdn-bundle-versions.json.gz");
  if (existsSync(legacyLedger)) {
    try {
      unlinkSync(legacyLedger);
    } catch {
      /* keep */
    }
  }

  return {
    cdnBundles,
    manifests: Boolean(fp && durableCatalogue),
    malieDatabases,
    apks,
    configCachePurged,
    orphans,
    durableCatalogue,
  };
}

/** True when ingest ledger says manifests fingerprint is already promoted. */
export function pokemonCdnManifestsLedgerFresh(
  packId: string,
  fingerprint: string,
): boolean {
  const ledger = readCatalogIngestLedger(packCatalogIngestLedgerPath(packId));
  const hit = ledger.entries[POKEMON_CDN_MANIFESTS_ARTEFACT];
  return Boolean(hit && hit.contentHash === fingerprint);
}
