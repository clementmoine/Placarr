import { describe, expect, it } from "vitest";

import {
  catalogueArtQualityMarker,
  catalogueFaceRankScore,
  pickBestCatalogueFace,
} from "./catalogueFaceRank";

describe("catalogueFaceRank", () => {
  it("marks corrected / reconstructed without naming providers", () => {
    expect(catalogueArtQualityMarker("art.foo.corrected.jpg")).toBe(100);
    expect(catalogueArtQualityMarker("art.reconstructed.webp")).toBe(95);
    expect(catalogueArtQualityMarker("art.any.webp")).toBe(50);
  });

  it("prefers more pixels at equal provenance", () => {
    expect(
      catalogueFaceRankScore({
        artFile: "art.a.webp",
        width: 1000,
        height: 1400,
      }),
    ).toBeGreaterThan(
      catalogueFaceRankScore({
        artFile: "art.b.webp",
        width: 400,
        height: 560,
      }),
    );
  });

  it("demotes listing_photo vs catalog at similar size", () => {
    const catalog = catalogueFaceRankScore({
      artFile: "art.publisher.webp",
      width: 740,
      height: 1032,
      coverProvenance: "catalog",
    });
    const listing = catalogueFaceRankScore({
      artFile: "art.shop.webp",
      width: 750,
      height: 1096,
      coverProvenance: "listing_photo",
    });
    expect(catalog).toBeGreaterThan(listing);
  });

  it("treats unknown sources equally when dims are missing", () => {
    expect(
      catalogueFaceRankScore({ artFile: "art.alpha.webp" }),
    ).toBe(catalogueFaceRankScore({ artFile: "art.beta.webp" }));
  });

  it("pickBestCatalogueFace skips unmeasurable and prefers catalog over listing", () => {
    expect(
      pickBestCatalogueFace([
        { id: "a", artFile: "art.a.webp", width: 0, height: 0 },
        { id: "b", artFile: "art.b.webp", width: 0, height: 0 },
      ]),
    ).toBeNull();

    const best = pickBestCatalogueFace(
      [
        {
          id: "shop",
          artFile: "art.shop.webp",
          width: 764,
          height: 1000,
          coverProvenance: "listing_photo",
        },
        {
          id: "publisher",
          artFile: "art.publisher.webp",
          width: 336,
          height: 421,
          coverProvenance: "catalog",
        },
      ],
      { areaDecidesBelow: 200_000, tieBreakIds: ["publisher", "shop"] },
    );
    expect(best?.id).toBe("publisher");
  });
});
