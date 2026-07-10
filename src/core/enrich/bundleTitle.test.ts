import { describe, expect, it } from "vitest";

import {
  buildBundleMetadataSearchQueries,
  bundleTitlePartsMatchCatalogTitle,
  isBundleTitle,
  splitBundleTitle,
} from "./bundleTitle";

describe("splitBundleTitle", () => {
  it("splits bundle titles on +, &, and and", () => {
    expect(
      splitBundleTitle(
        "LEGO Indiana Jones: The Original Adventures & Kung Fu Panda",
      ),
    ).toEqual(["LEGO Indiana Jones: The Original Adventures", "Kung Fu Panda"]);
    expect(splitBundleTitle("Game A + Game B")).toEqual(["Game A", "Game B"]);
    expect(splitBundleTitle("Game A and Game B")).toEqual(["Game A", "Game B"]);
  });
});

describe("buildBundleMetadataSearchQueries", () => {
  it("derives dual-pack and pack queries for video-game bundles", () => {
    expect(
      buildBundleMetadataSearchQueries(
        "LEGO Indiana Jones: The Original Adventures & Kung Fu Panda",
        "Xbox 360",
        "Xbox 360",
      ),
    ).toEqual(
      expect.arrayContaining([
        "LEGO Indiana Jones: The Original Adventures Kung Fu Panda",
        "LEGO Indiana Jones: The Original Adventures + Kung Fu Panda",
        "LEGO Indiana Jones: The Original Adventures/Kung Fu Panda",
        "LEGO Indiana Jones: The Original Adventures + Kung Fu Panda Dual Pack",
        "Pack : LEGO Indiana Jones: The Original Adventures + Kung Fu Panda / Xbox 360",
      ]),
    );
  });
});

describe("bundleTitlePartsMatchCatalogTitle", () => {
  it("accepts retailer dual-pack listings for & bundle titles", () => {
    expect(
      bundleTitlePartsMatchCatalogTitle(
        "LEGO Indiana Jones: The Original Adventures & Kung Fu Panda",
        "LEGO Indiana Jones + Kung Fu Panda - Xbox 360",
      ),
    ).toBe(true);
  });

  it("detects multi-part bundle titles", () => {
    expect(
      isBundleTitle(
        "LEGO Indiana Jones: The Original Adventures & Kung Fu Panda",
      ),
    ).toBe(true);
  });

  it("accepts slash bundles with roman sequel numbers in catalog titles", () => {
    expect(
      bundleTitlePartsMatchCatalogTitle(
        "Halo Reach / Fable III",
        "Halo Reach & Fable 3 [Double Pack]",
      ),
    ).toBe(true);
  });
});
