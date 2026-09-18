/**
 * Unit tests for CDN AssetManifest URL + intersect helpers (no network).
 */
import { describe, expect, it } from "vitest";

import {
  assetManifestUrl,
  buildCdnCatalogue,
  filterCardBundleNames,
  intersectWantedWithManifest,
  isCardBundleAssetName,
  type CdnManifestDump,
} from "./cdnManifest";

function dump(
  bucket: string,
  locale: string,
  assets: string[],
  entries?: CdnManifestDump["entries"],
): CdnManifestDump {
  return {
    contentBase: "https://cdn/",
    bucket,
    locale,
    assetCount: assets.length,
    assets,
    entries,
  };
}

describe("cdnManifest", () => {
  it("builds_manifest_url_under_content_base", () => {
    expect(
      assetManifestUrl(
        "https://cdn.studio-prod.pokemon.com/rainier/Content/Android/1.40.0/",
        "10101_0000",
        "fr",
      ),
    ).toBe(
      "https://cdn.studio-prod.pokemon.com/rainier/Content/Android/1.40.0/10101_0000/manifest_fr_10101_0000",
    );
  });

  it("filters_card_bundles_and_langs", () => {
    const names = filterCardBundleNames(
      [
        "xy8_fr_012",
        "xy8_fr_012_t",
        "xy8_en_012",
        "shadersbundle",
        "attack_fire",
        "me4_fr_001",
      ],
      { langs: ["fr"], includeThumbnails: false },
    );
    expect(names).toEqual(["xy8_fr_012", "me4_fr_001"]);
    expect(isCardBundleAssetName("svbsp_ptbr_045")).toBe(true);
    expect(isCardBundleAssetName("shadersbundle")).toBe(false);
  });

  it("intersects_wanted_with_manifest", () => {
    const { hit, miss } = intersectWantedWithManifest(
      ["xy8_fr_012", "missing_fr_001", "xy8_fr_012"],
      ["XY8_FR_012", "me4_fr_001"],
    );
    expect(hit).toEqual(["xy8_fr_012"]);
    expect(miss).toEqual(["missing_fr_001"]);
  });

  it("unions_buckets_and_records_where_each_bundle_lives", () => {
    const cat = buildCdnCatalogue(
      [
        dump("10101_0000", "fr", ["xy8_fr_012"]),
        dump("20260521_1700", "fr", ["me4_fr_001"]),
        dump("20260716_1700", "fr", ["me5_fr_001"]),
      ],
      { langs: ["fr"] },
    );
    expect(cat.names).toEqual(["me4_fr_001", "me5_fr_001", "xy8_fr_012"]);
    expect(cat.bucketOf.get("me4_fr_001")).toBe("20260521_1700");
    expect(cat.bucketOf.get("me5_fr_001")).toBe("20260716_1700");
    expect(cat.bucketOf.get("xy8_fr_012")).toBe("10101_0000");
    expect(cat.buckets).toHaveLength(3);
  });

  it("lets_the_freshest_bucket_win_for_a_set_split_across_epochs", () => {
    // mebsp really does span several epochs; the later dump must override.
    const cat = buildCdnCatalogue(
      [
        dump("20260618_1700", "de", ["mebsp_de_046"]),
        dump("20260423_1700", "de", ["mebsp_de_046"]),
      ],
      { langs: ["de"] },
    );
    expect(cat.bucketOf.get("mebsp_de_046")).toBe("20260618_1700");
    expect(cat.names).toEqual(["mebsp_de_046"]);
  });

  it("keeps_crc_and_drops_non_card_assets", () => {
    const cat = buildCdnCatalogue(
      [
        dump(
          "10101_0000",
          "fr",
          ["xy8_fr_012", "xy8_fr_012_t", "shadersbundle"],
          [
            { name: "xy8_fr_012", crc: 42 },
            { name: "shadersbundle", crc: 7 },
          ],
        ),
      ],
      { langs: ["fr"] },
    );
    expect(cat.names).toEqual(["xy8_fr_012"]);
    expect(cat.crcOf.get("xy8_fr_012")).toBe(42);
    expect(cat.crcOf.has("shadersbundle")).toBe(false);
    // assetCount counts everything the manifest listed, cards or not.
    expect(cat.assetCount).toBe(3);
  });
});
