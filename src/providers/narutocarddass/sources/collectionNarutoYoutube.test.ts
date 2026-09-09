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

  it("lists the 10 S1 manga prerelease true variants at ~10 €", () => {
    expect(dig.setCardCounts.s1.prereleaseAlts).toBe(10);
    expect(dig.indicativePrices.s1.prereleaseEur).toBe(10);
    expect(dig.prerelease.fullTen).toEqual([
      "ni025",
      "ni019",
      "ni047",
      "ni027",
      "ta005",
      "ta004",
      "te015",
      "te007",
      "te003",
      "te036",
    ]);
    expect(
      dig.prerelease.nonHoloAltsOfHolos.cards.map((c) => c.number).sort(),
    ).toEqual(["ni019", "ta005", "te007", "te036"]);
    expect(dig.indicativePrices.s2.premium.map((p) => p.number).sort()).toEqual(
      ["ni064", "ni068", "te073"],
    );
    expect(dig.indicativePrices.s3.premium.map((p) => p.number).sort()).toEqual(
      ["ni063", "ni128", "ni129", "ni153"],
    );
    expect(dig.indicativePrices.s4).toMatchObject({
      normalEur: 0.3,
      holoEur: 10,
    });
    expect(dig.indicativePrices.s4.premium.map((p) => p.number).sort()).toEqual(
      ["ni167", "ni168", "ni172", "ni203"],
    );
    expect(dig.indicativePrices.s5).toMatchObject({ normalEur: 0.5 });
    expect(dig.indicativePrices.s5.premium.map((p) => p.number).sort()).toEqual(
      ["ni221", "ni247", "ni254"],
    );
    expect(dig.indicativePrices.s6.premium.map((p) => p.number).sort()).toEqual(
      ["ni236", "ni240", "ni252", "ni253", "ta221", "ta226", "ta227"],
    );
  });

  it("records promo shuriken lists and CdF / tin specials", () => {
    expect(dig.promos.lists["1"]).toEqual(
      expect.arrayContaining(["te002", "te139", "ni034"]),
    );
    expect(dig.promos.lists["2"]).toEqual(
      expect.arrayContaining(["ni063", "ta081"]),
    );
    expect(dig.promos.lists["3"]).toEqual(
      expect.arrayContaining(["ni023", "ta011", "te073"]),
    );
    expect(dig.indicativePrices.promo).toMatchObject({
      shuriken1Eur: 20,
      shuriken2Eur: 30,
      shuriken3Eur: 50,
    });
    expect(
      dig.indicativePrices.promo.special.map((p) => [p.number, p.priceEur]),
    ).toEqual(
      expect.arrayContaining([
        ["pr016", 5],
        ["pr011", 8],
        ["ni023", 100],
      ]),
    );
  });
});
