import { describe, expect, it } from "vitest";

import dig from "../curated/sources/collection-naruto-youtube-2026-08-29.json";
import sets from "../curated/sources/sets.json";
import { NARUTO_SEALED_SKUS } from "../sealedProducts";

describe("collection-naruto youtube dig", () => {
  it("covers both master-set videos and mints pack-decouverte + tin-box-hobby", () => {
    expect(dig.videos.map((v) => v.id).sort()).toEqual([
      "7r7LwtIENKs",
      "JYwlXQQlooI",
    ]);
    expect(dig.sealedFrCarddass.attestedNow.map((r) => r.slug).sort()).toEqual([
      "pack-decouverte",
      "tin-box-hobby",
    ]);
    expect(
      dig.sealedFrCarddass.skuGapsNeedPackshot.some(
        (g) => g.slug === "display-s1",
      ),
    ).toBe(true);
    expect(
      dig.sealedFrCarddass.skuGapsNeedPackshot.some(
        (g) => g.slug === "tin-box-hobby",
      ),
    ).toBe(false);
    expect(dig.doNot.join(" ")).toMatch(/display-s1/);
    const pack = NARUTO_SEALED_SKUS.find((r) => r.slug === "pack-decouverte");
    expect(pack).toMatchObject({
      kind: "coffret",
      setCode: "s1",
      attested: true,
      stagingFile: "pack-decouverte.jpg",
      stagingKind: "wrappers",
      declaredCardCount: 96,
    });
    expect(
      NARUTO_SEALED_SKUS.find((r) => r.slug === "tin-box-hobby"),
    ).toMatchObject({
      kind: "coffret",
      stagingFile: "tin-box-hobby.png",
      stagingKind: "wrappers",
      name: "Tin Box Hobby",
    });
  });

  it("records collector counts on Carddass FR sets", () => {
    expect(sets.sets.s1.collectorCount?.total).toBe(188);
    expect(sets.sets.s5.collectorCount?.total).toBe(149);
    expect(sets.sets.s6.frenchArtefact).toMatch(/MADE IN JAPAN/i);
  });
});
