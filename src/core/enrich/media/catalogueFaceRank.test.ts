import { describe, expect, it } from "vitest";

import { rankCoversForDisplay } from "./coverDisplayRank";
import {
  catalogueFaceAsScoredAttachment,
  catalogueFaceQualityMarker,
  catalogueFaceRankScore,
  observeCatalogueFace,
  pickBestCatalogueFace,
} from "./catalogueFaceRank";

describe("catalogueFaceRank", () => {
  it("observes Affiche stamps from basename only when meta missing", () => {
    expect(observeCatalogueFace({ artFile: "art.reconstructed.webp" })).toEqual(
      {
        artFile: "art.reconstructed.webp",
        width: undefined,
        height: undefined,
        coverProvenance: "catalog",
        artKind: "reconstructed",
        watermarked: false,
        thumbOnly: undefined,
      },
    );
    expect(
      observeCatalogueFace({
        artFile: "art.coleka.webp",
        artKind: "corrected",
        watermarked: false,
        coverProvenance: "listing_photo",
      })?.artKind,
    ).toBe("corrected");
  });

  it("marks corrected / reconstructed / sample without naming providers", () => {
    expect(catalogueFaceQualityMarker({ artFile: "art.foo.corrected.jpg" })).toBe(
      100,
    );
    expect(
      catalogueFaceQualityMarker({ artFile: "art.reconstructed.webp" }),
    ).toBe(95);
    expect(catalogueFaceQualityMarker({ artFile: "art.sample.webp" })).toBe(20);
    expect(catalogueFaceQualityMarker({ artFile: "art.any.webp" })).toBe(50);
  });

  it("projects catalogue faces into Affiche attachments with same stamp order", () => {
    const corrected = observeCatalogueFace({
      artFile: "art.corrected.webp",
      width: 400,
      height: 560,
    })!;
    const dump = observeCatalogueFace({
      artFile: "art.dump.webp",
      width: 400,
      height: 560,
    })!;
    const ranked = rankCoversForDisplay([
      catalogueFaceAsScoredAttachment(dump, { url: "/dump.webp" }),
      catalogueFaceAsScoredAttachment(corrected, { url: "/corrected.webp" }),
    ]);
    expect(ranked[0]?.url).toBe("/corrected.webp");
  });

  it("demotes near-square padded embeds vs packshot aspect", () => {
    const packshot = catalogueFaceRankScore({
      artFile: "art.shop.jpg",
      width: 736,
      height: 597,
      coverProvenance: "catalog",
    });
    const square = catalogueFaceRankScore({
      artFile: "art.drive.png",
      width: 1600,
      height: 1600,
      coverProvenance: "catalog",
    });
    expect(packshot).toBeGreaterThan(square);
  });

  it("prefers stamped artKind over a misleading basename", () => {
    expect(
      catalogueFaceRankScore({
        artFile: "art.coleka.webp",
        width: 400,
        height: 560,
        artKind: "corrected",
      }),
    ).toBeGreaterThan(
      catalogueFaceRankScore({
        artFile: "art.coleka.webp",
        width: 400,
        height: 560,
        artKind: "dump",
      }),
    );
  });

  it("demotes stamped watermarked even when basename looks clean", () => {
    expect(
      catalogueFaceRankScore({
        artFile: "art.coleka.webp",
        width: 500,
        height: 700,
        watermarked: true,
      }),
    ).toBeLessThan(
      catalogueFaceRankScore({
        artFile: "art.coleka.webp",
        width: 500,
        height: 700,
        watermarked: false,
      }),
    );
  });

  it("demotes SAMPLE watermark faces vs equal-size catalog art", () => {
    const clean = catalogueFaceRankScore({
      artFile: "art.publisher.webp",
      width: 500,
      height: 700,
    });
    const sample = catalogueFaceRankScore({
      artFile: "art.sample.webp",
      width: 500,
      height: 700,
    });
    expect(clean).toBeGreaterThan(sample);
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
