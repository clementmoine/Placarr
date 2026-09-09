import { describe, expect, it } from "vitest";

import {
  apkEntriesFromZipListing,
  normalizedApkFileName,
  parseApkComboDownload,
  parseApkPureLatestVersion,
  shouldDownloadStoreApk,
  xapkManifestPackageId,
  type ApkStoreMeta,
} from "./apkStoreFetch";
import { catalogueApkPacks } from "./cataloguePacks";

const PKG = "com.example.tcg";

describe("parseApkPureLatestVersion", () => {
  it.each([
    {
      name: "XAPK download button",
      html: `<a href="https://d.apkpure.com/b/XAPK/${PKG}?versionCode=558766&nc=arm64-v8a&sv=28">Download</a>`,
      expected: { versionCode: 558766, type: "XAPK" },
    },
    {
      name: "plain APK link",
      html: `<a href="https://d.apkpure.com/b/APK/${PKG}?versionCode=42">DL</a>`,
      expected: { versionCode: 42, type: "APK" },
    },
    {
      name: "newest versionCode wins across variants",
      html: [
        `href="https://d.apkpure.com/b/XAPK/${PKG}?versionCode=100"`,
        `href="https://d.apkpure.com/b/XAPK/${PKG}?versionCode=120"`,
        `href="https://d.apkpure.com/b/APK/${PKG}?versionCode=110"`,
      ].join("\n"),
      expected: { versionCode: 120, type: "XAPK" },
    },
    {
      name: "XAPK preferred over APK at equal versionCode",
      html: [
        `href="https://d.apkpure.com/b/APK/${PKG}?versionCode=7"`,
        `href="https://d.apkpure.com/b/XAPK/${PKG}?versionCode=7"`,
      ].join("\n"),
      expected: { versionCode: 7, type: "XAPK" },
    },
    {
      name: "case-insensitive host/type",
      html: `href="https://D.APKPURE.COM/b/xapk/${PKG}?versionCode=9"`,
      expected: { versionCode: 9, type: "XAPK" },
    },
  ])("$name", ({ html, expected }) => {
    expect(parseApkPureLatestVersion(html, PKG)).toEqual(expected);
  });

  it.each([
    { name: "no download link", html: "<html><body>nothing</body></html>" },
    {
      name: "another package's link never counts",
      html: `href="https://d.apkpure.com/b/XAPK/com.other.app?versionCode=99"`,
    },
    {
      name: "version=latest link carries no versionCode",
      html: `href="https://d.apkpure.com/b/XAPK/${PKG}?version=latest"`,
    },
  ])("returns null — $name (honest empty, never a guess)", ({ html }) => {
    expect(parseApkPureLatestVersion(html, PKG)).toBeNull();
  });
});

describe("parseApkComboDownload", () => {
  const presigned = `https%3A%2F%2Fapks.abc123.r2.cloudflarestorage.com%2F${PKG}%2F1.41.0%2F1167182.159edab8646b4b22fc88793a1dc95d1ed57b1cba.apks%3FX-Amz-Signature%3Ddeadbeef`;

  it("extracts versionCode + decoded presigned URL", () => {
    const html = [
      `<span class="vername">Example 1.41.0</span>`,
      `<span class="vercode">(1167182)</span>`,
      `<a href="/r2?u=${presigned}">Download</a>`,
    ].join("\n");
    expect(parseApkComboDownload(html, PKG)).toEqual({
      versionCode: 1167182,
      url: `https://apks.abc123.r2.cloudflarestorage.com/${PKG}/1.41.0/1167182.159edab8646b4b22fc88793a1dc95d1ed57b1cba.apks?X-Amz-Signature=deadbeef`,
    });
  });

  it("falls back to the versionCode embedded in the artifact path", () => {
    const html = `<a href="/r2?u=${presigned}">Download</a>`;
    expect(parseApkComboDownload(html, PKG)?.versionCode).toBe(1167182);
  });

  it.each([
    { name: "no r2 link", html: `<span class="vercode">(42)</span>` },
    {
      name: "presigned URL for another package",
      html: `<a href="/r2?u=https%3A%2F%2Fapks.abc.r2.cloudflarestorage.com%2Fcom.other%2F1%2F42.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apks%3Fsig%3Dx">x</a>`,
    },
  ])("returns null — $name", ({ html }) => {
    expect(parseApkComboDownload(html, PKG)).toBeNull();
  });
});

describe("apkEntriesFromZipListing", () => {
  it("keeps root .apk entries only (base + splits, not nested assets)", () => {
    expect(
      apkEntriesFromZipListing([
        "manifest.json",
        "icon.png",
        "base.apk",
        "split_UnityDataAssetPack.apk",
        "config.arm64_v8a.apk",
        "Android/obb/main.obb",
        "nested/dir/fake.apk",
        "AndroidManifest.xml",
      ]),
    ).toEqual(["base.apk", "split_UnityDataAssetPack.apk", "config.arm64_v8a.apk"]);
  });

  it("empty listing → no entries", () => {
    expect(apkEntriesFromZipListing([])).toEqual([]);
  });
});

describe("normalizedApkFileName", () => {
  it.each([
    // Device-pull convention is the contract the extract runners read
    // (preferredLorcanaApk wants split_UnityDataAssetPack.apk exactly).
    { entry: `${PKG}.apk`, expected: "base.apk" },
    { entry: "base.apk", expected: "base.apk" },
    { entry: "UnityDataAssetPack.apk", expected: "split_UnityDataAssetPack.apk" },
    { entry: "config.arm64_v8a.apk", expected: "split_config.arm64_v8a.apk" },
    { entry: "split_config.arm64_v8a.apk", expected: "split_config.arm64_v8a.apk" },
  ])("$entry → $expected", ({ entry, expected }) => {
    expect(normalizedApkFileName(entry, PKG)).toBe(expected);
  });
});

describe("xapkManifestPackageId", () => {
  it.each([
    {
      name: "valid manifest",
      json: JSON.stringify({ package_name: PKG, name: "Example" }),
      expected: PKG,
    },
    { name: "missing field", json: "{}", expected: null },
    { name: "invalid JSON", json: "not-json", expected: null },
    {
      name: "non-string package_name",
      json: JSON.stringify({ package_name: 5 }),
      expected: null,
    },
  ])("$name", ({ json, expected }) => {
    expect(xapkManifestPackageId(json)).toBe(expected);
  });
});

describe("shouldDownloadStoreApk", () => {
  const meta = (versionCode?: number): ApkStoreMeta => ({
    packageId: PKG,
    source: "apkpure",
    checkedAt: new Date().toISOString(),
    ...(versionCode != null
      ? { versionCode, fetchedAt: new Date().toISOString() }
      : {}),
  });
  const latest = { versionCode: 100, type: "XAPK" as const };

  it.each([
    {
      name: "store newer than tracked install → download",
      meta: meta(99),
      hasApks: true,
      force: false,
      expected: true,
    },
    {
      name: "same versionCode with APKs on disk → up to date",
      meta: meta(100),
      hasApks: true,
      force: false,
      expected: false,
    },
    {
      name: "tracked ahead of the mirror (mirror lag) → keep local",
      meta: meta(101),
      hasApks: true,
      force: false,
      expected: false,
    },
    {
      name: "no meta (unknown provenance) → establish baseline",
      meta: null,
      hasApks: true,
      force: false,
      expected: true,
    },
    {
      name: "meta without versionCode (probe-only stamp) → download",
      meta: meta(),
      hasApks: true,
      force: false,
      expected: true,
    },
    {
      name: "no APKs on disk → download even if meta claims current",
      meta: meta(100),
      hasApks: false,
      force: false,
      expected: true,
    },
    {
      name: "force → always download",
      meta: meta(100),
      hasApks: true,
      force: true,
      expected: true,
    },
  ])("$name", ({ meta: metaRow, hasApks, force, expected }) => {
    expect(shouldDownloadStoreApk(metaRow, latest, { force, hasApks })).toBe(
      expected,
    );
  });
});

describe("catalogueApkPacks", () => {
  it("exactly the foil-meta packs carry an Android package (APK lab + store)", () => {
    const packs = catalogueApkPacks();
    expect(packs.map((pack) => pack.id).sort()).toEqual(["lorcana", "pokemon"]);
    for (const pack of packs) {
      expect(pack.androidPackageId).toMatch(/^[a-z][\w.]+$/i);
      expect(pack.hasFoilMeta).toBe(true);
    }
  });
});
