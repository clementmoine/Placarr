/**
 * Unit tests for CDN AssetManifest URL + intersect helpers (no network).
 */
import { describe, expect, it } from "vitest";

import {
  assetManifestUrl,
  filterCardBundleNames,
  intersectWantedWithManifest,
  isCardBundleAssetName,
} from "./cdnManifest";

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
});
