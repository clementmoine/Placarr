/**
 * Live staging promote → ledger → purge (empty staging after success).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyCdnCatalogue } from "../cdn/cdnManifest";
import { loadDurableCdnCatalogue } from "../cdn/durableCdnCatalogue";
import {
  MALIE_CACHE_META,
  MALIE_IDENTITIES_CACHE,
  writeMalieIdentitiesCache,
} from "../cdn/malie";
import {
  emptyBundleLedger,
  loadBundleLedger,
  recordBundleVersion,
  saveBundleLedger,
} from "./bundleLedger";
import {
  APK_STORE_META_FILE,
  POKEMON_STAGING_DIG_DIRS,
  promoteAndPurgeLiveStaging,
  recordSharedBundlesFromCatalogue,
} from "./liveStagingPurge";

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "live-purge-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("liveStagingPurge", () => {
  it("records_shared_hashes_and_purges_verified_cdn_bundles", () => {
    const staging = path.join(root, "staging");
    const bundles = path.join(staging, "cdn-bundles");
    mkdirSync(bundles, { recursive: true });
    writeFileSync(path.join(bundles, "shadersbundle"), "s");
    writeFileSync(path.join(bundles, "attack_fire"), "a");
    writeFileSync(path.join(bundles, "last-scrape.json"), "{}");

    const cat = emptyCdnCatalogue();
    cat.hashOf.set("shadersbundle", "h-s");
    cat.hashOf.set("attack_fire", "h-f");
    cat.bucketOf.set("shadersbundle", "10101_0000");
    cat.names.push("xy8_fr_012");
    cat.hashOf.set("xy8_fr_012", "h-c");

    expect(recordSharedBundlesFromCatalogue(root, cat)).toBeGreaterThan(0);
    const ledger = loadBundleLedger(root);
    expect(ledger.entries.shadersbundle?.hash).toBe("h-s");

    const out = promoteAndPurgeLiveStaging({
      cacheRoot: root,
      stagingDir: staging,
      catalogue: cat,
      manifestFingerprint: "ver|dir|base|fr|",
      apkVersionHash: "versionCode:1",
      ledgerPath: path.join(root, "logs", "catalog-ingest-ledger.json"),
    });
    expect(out.cdnBundles.purged).toBeGreaterThanOrEqual(2);
    expect(existsSync(path.join(bundles, "shadersbundle"))).toBe(false);
    expect(existsSync(path.join(bundles, "last-scrape.json"))).toBe(false);
    expect(existsSync(bundles)).toBe(false);
    expect(loadDurableCdnCatalogue(root)?.fingerprint).toBe("ver|dir|base|fr|");
  });

  it("purges_malie_apks_config_cache_and_durables_apk_meta", () => {
    const staging = path.join(root, "staging");
    const malieDb = path.join(staging, "malie-databases");
    const apks = path.join(staging, "apks");
    const dig = path.join(staging, "config-cache");
    mkdirSync(malieDb, { recursive: true });
    mkdirSync(apks, { recursive: true });
    mkdirSync(dig, { recursive: true });
    mkdirSync(path.join(root, "logs"), { recursive: true });
    writeFileSync(path.join(malieDb, "card-database-x.json.gz"), "db");
    writeFileSync(path.join(apks, "base.apk"), "apk");
    writeFileSync(
      path.join(apks, APK_STORE_META_FILE),
      JSON.stringify({ packageId: "jp.pokemon.pokemontcgl", versionCode: 42 }),
    );
    writeFileSync(path.join(dig, "asset-bundle-manifest_0.0.json"), "{}");

    writeMalieIdentitiesCache(staging, [], {
      fingerprint: "fp-malie",
      langs: ["fr"],
      bundleStems: 0,
      setnums: 0,
    });
    writeFileSync(path.join(staging, "malie-bundle-stems.txt"), "");
    writeFileSync(path.join(staging, "cdn-catalogue-setnum.txt"), "");

    const cat = emptyCdnCatalogue();
    cat.names.push("a");
    const out = promoteAndPurgeLiveStaging({
      cacheRoot: root,
      stagingDir: staging,
      catalogue: cat,
      manifestFingerprint: "fp-m",
      apkVersionHash: "versionCode:42",
      ledgerPath: path.join(root, "logs", "catalog-ingest-ledger.json"),
    });

    expect(existsSync(malieDb)).toBe(false);
    expect(existsSync(apks)).toBe(false);
    expect(existsSync(dig)).toBe(false);
    expect(out.configCachePurged).toBe(true);
    expect(out.apks.keptMeta).toBe(true);
    expect(existsSync(path.join(root, "logs", APK_STORE_META_FILE))).toBe(true);
    expect(existsSync(path.join(root, "logs", MALIE_IDENTITIES_CACHE))).toBe(
      true,
    );
    expect(existsSync(path.join(root, "logs", MALIE_CACHE_META))).toBe(true);
  });

  it("dig_dir_allowlist_is_empty_after_cold_start", () => {
    expect(POKEMON_STAGING_DIG_DIRS).toEqual([]);
  });

  it("assumed_card_promotes_then_purges", () => {
    const staging = path.join(root, "staging");
    const bundles = path.join(staging, "cdn-bundles");
    mkdirSync(bundles, { recursive: true });
    writeFileSync(path.join(bundles, "xy8_fr_012"), "c");
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "xy8_fr_012", "h1", { assumed: true });
    saveBundleLedger(root, ledger);

    const out = promoteAndPurgeLiveStaging({
      cacheRoot: root,
      stagingDir: staging,
    });
    expect(out.cdnBundles.promoted).toBe(1);
    expect(out.cdnBundles.purged).toBe(1);
    expect(loadBundleLedger(root).entries.xy8_fr_012?.assumed).toBeUndefined();
  });
});
