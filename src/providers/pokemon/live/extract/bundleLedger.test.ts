/**
 * Freshness ledger: the cache key that decides whether an on-disk bundle
 * still matches the manifest (no network).
 */
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bundleFreshness,
  emptyBundleLedger,
  loadBundleLedger,
  promoteAssumedBundlesToVerified,
  purgeVerifiedCdnBundles,
  recordBundleVersion,
  removeDirIfEmpty,
  saveBundleLedger,
} from "./bundleLedger";

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "ledger-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("bundleLedger", () => {
  it("round_trips_through_gzip", () => {
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "XY8_FR_012", "abc123", {
      bucket: "10101_0000",
    });
    saveBundleLedger(root, ledger);

    const back = loadBundleLedger(root);
    expect(back.entries["xy8_fr_012"]?.hash).toBe("abc123");
    expect(back.entries["xy8_fr_012"]?.bucket).toBe("10101_0000");
    expect(back.entries["xy8_fr_012"]?.assumed).toBeUndefined();
  });

  it("reports_stale_only_when_the_hash_actually_moved", () => {
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "xy8_fr_012", "abc123");

    expect(bundleFreshness(ledger, "xy8_fr_012", "abc123")).toBe("fresh");
    expect(bundleFreshness(ledger, "xy8_fr_012", "def456")).toBe("stale");
    // Case-insensitive, like every other bundle-name lookup.
    expect(bundleFreshness(ledger, "XY8_FR_012", "abc123")).toBe("fresh");
  });

  it("keeps_assumed_matching_hash_fresh_so_on_disk_is_not_refetched", () => {
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "xy8_fr_012", "abc123", { assumed: true });
    expect(bundleFreshness(ledger, "xy8_fr_012", "abc123")).toBe("fresh");
  });

  it("treats_an_unknown_bundle_as_unknown_never_stale", () => {
    // Scrape adopts on-disk unknowns as assumed; no hash move → never stale.
    const ledger = emptyBundleLedger();
    expect(bundleFreshness(ledger, "me4_fr_001", "abc123")).toBe("unknown");
  });

  it("treats_a_missing_expected_hash_as_unknown", () => {
    // Non-catalogue scrapes supply no hashes; they must keep skipping.
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "xy8_fr_012", "abc123");
    expect(bundleFreshness(ledger, "xy8_fr_012", null)).toBe("unknown");
    expect(bundleFreshness(ledger, "xy8_fr_012", undefined)).toBe("unknown");
  });

  it("marks_adopted_rows_so_assumed_freshness_stays_visible", () => {
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "xy8_fr_012", "abc123", { assumed: true });
    saveBundleLedger(root, ledger);
    expect(loadBundleLedger(root).entries["xy8_fr_012"]?.assumed).toBe(true);
  });

  it("writes_ledger_under_logs_not_staging_root", () => {
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "xy8_fr_012", "abc123");
    const saved = saveBundleLedger(root, ledger);
    expect(saved).toContain(`${path.sep}logs${path.sep}`);
    expect(loadBundleLedger(root).entries["xy8_fr_012"]?.hash).toBe("abc123");
  });

  it("purges_verified_bundles_keeps_assumed", () => {
    const bundles = path.join(root, "cdn-bundles");
    mkdirSync(bundles, { recursive: true });
    writeFileSync(path.join(bundles, "verified.bin"), "v");
    writeFileSync(path.join(bundles, "assumed.bin"), "a");
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "verified.bin", "h1");
    recordBundleVersion(ledger, "assumed.bin", "h2", { assumed: true });
    saveBundleLedger(root, ledger);
    const out = purgeVerifiedCdnBundles(root, bundles);
    expect(out.purged).toBe(1);
    expect(out.kept).toBe(1);
    expect(out.removedDir).toBe(false);
    expect(existsSync(bundles)).toBe(true);
  });

  it("promoteAssumedBundlesToVerified_then_purge_clears_adopted_staging", () => {
    const bundles = path.join(root, "cdn-bundles");
    mkdirSync(bundles, { recursive: true });
    writeFileSync(path.join(bundles, "assumed.bin"), "a");
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "assumed.bin", "h2", { assumed: true });
    saveBundleLedger(root, ledger);
    expect(promoteAssumedBundlesToVerified(root).promoted).toBe(1);
    expect(loadBundleLedger(root).entries["assumed.bin"]?.assumed).toBeUndefined();
    const out = purgeVerifiedCdnBundles(root, bundles);
    expect(out.purged).toBe(1);
    expect(out.kept).toBe(0);
    expect(out.removedDir).toBe(true);
    expect(existsSync(bundles)).toBe(false);
  });

  it("removeDirIfEmpty_drops_ds_store_only_dirs", () => {
    const dir = path.join(root, "emptyish");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, ".DS_Store"), "");
    expect(removeDirIfEmpty(dir)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("ignores_a_hashless_record_and_a_missing_file", () => {
    const ledger = emptyBundleLedger();
    recordBundleVersion(ledger, "xy8_fr_012", null);
    expect(Object.keys(ledger.entries)).toHaveLength(0);
    expect(loadBundleLedger(root).entries).toEqual({});
  });
});
