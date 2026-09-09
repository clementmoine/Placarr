import { describe, expect, it } from "vitest";

import dig from "../curated/sources/rakuten-tin-box-hobby-2026-08-30.json";
import { rakutenIngestPackshots } from "./rakutenPackshots";
import { NARUTO_SEALED_SKUS } from "../sealedProducts";
import { productSourceFromStagingRel } from "../productChoice";

describe("rakuten tin-box-hobby", () => {
  it("keeps Hobby SKU distinct; Rakuten face stays archival", () => {
    expect(dig.productId).toBe("1962181402");
    expect(dig.ean).toBeNull();
    expect(dig.doNot.join(" ")).toMatch(/fusionner/i);
    expect(dig.doNot.join(" ")).toMatch(/art\.rakuten/i);
    expect(rakutenIngestPackshots()).toEqual([]);
    expect(
      NARUTO_SEALED_SKUS.find((row) => row.slug === "tin-box-hobby"),
    ).toMatchObject({
      stagingFile: "tin-box-hobby.png",
      stagingKind: "wrappers",
      name: "Tin Box Hobby",
    });
    expect(
      NARUTO_SEALED_SKUS.find((row) => row.slug === "tin-box"),
    ).toBeTruthy();
    expect(
      productSourceFromStagingRel(
        "staging/rakuten/tin-box-hobby/01-face.webp",
      ),
    ).toBe("rakuten");
  });
});
