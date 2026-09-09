import { describe, expect, it } from "vitest";

import {
  kayouOfficialModelSlug,
  kayouOfficialSealedKind,
  parseKayouPackagingCounts,
} from "./kayouOfficialSealedProducts";

describe("parseKayouPackagingCounts", () => {
  it("reads cards per pack and packs per box from official specs", () => {
    expect(
      parseKayouPackagingCounts(
        "5 cards per pack; 16 packs per box, including 1 promo card",
      ),
    ).toEqual({ cardsPerPack: 5, packsContained: 16 });
    expect(
      parseKayouPackagingCounts("8 cards/pack; 24 packs/box; 8 boxes/carton"),
    ).toEqual({ cardsPerPack: 8, packsContained: 24 });
  });
});

describe("kayouOfficialModelSlug", () => {
  it("normalizes model codes to product slugs", () => {
    expect(kayouOfficialModelSlug("NR-KP-RZSD-LH-001-NA")).toBe(
      "nr-kp-rzsd-lh-001-na",
    );
  });
});

describe("kayouOfficialSealedKind", () => {
  it("maps collector boxes and displays", () => {
    expect(
      kayouOfficialSealedKind({
        productName:
          "NARUTO-Smriti Collectible Cards-NINJA AGE-Premium Collector Box-001-NA",
        productSpecs: {},
      }),
    ).toBe("coffret");
    expect(
      kayouOfficialSealedKind({
        productName: "Heaven Scroll",
        productSpecs: { "Packaging Specs": "8 cards/pack; 24 packs/box" },
      }),
    ).toBe("display");
  });
});
