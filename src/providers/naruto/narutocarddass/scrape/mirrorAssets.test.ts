import { describe, expect, it } from "vitest";

import { mirrorNarutoAssetsAcrossCollectorNumbers } from "./scrapeCards";

describe("mirrorNarutoAssetsAcrossCollectorNumbers", () => {
  it("does not mirror art across different retail sets (browse uses artBorrowFrom)", () => {
    const { assets, mirrored } = mirrorNarutoAssetsAcrossCollectorNumbers({
      prints: [
        {
          printKey: "naruto:maki1-ni0017",
          setCode: "maki1",
          number: "ni0017",
          family: "ninja",
        },
        {
          printKey: "naruto:s1-ni0017",
          setCode: "s1",
          number: "ni0017",
          family: "ninja",
        },
      ],
      titles: [
        { printKey: "naruto:maki1-ni0017", lang: "ja" },
        { printKey: "naruto:s1-ni0017", lang: "ja" },
      ],
      assets: [
        {
          printKey: "naruto:s1-ni0017",
          lang: "ja",
          art: "art.suruga.jpg",
          thumb: null,
          back: null,
        },
      ],
    });
    expect(mirrored).toBe(0);
    expect(assets).toHaveLength(1);
  });

  it("does not invent art when no donor exists", () => {
    const { assets, mirrored } = mirrorNarutoAssetsAcrossCollectorNumbers({
      prints: [
        {
          printKey: "naruto:maki12-ni0255",
          setCode: "maki12",
          number: "ni0255",
          family: "ninja",
        },
      ],
      titles: [{ printKey: "naruto:maki12-ni0255", lang: "ja" }],
      assets: [],
    });
    expect(mirrored).toBe(0);
    expect(assets).toEqual([]);
  });

  it("mirrors retail FR art onto manga prerelease stubs", () => {
    const { assets, mirrored } = mirrorNarutoAssetsAcrossCollectorNumbers({
      prints: [
        {
          printKey: "naruto:s1-ni0019",
          setCode: "s1",
          number: "ni0019",
          cardType: "ni",
        },
        {
          printKey: "naruto:s1-ni0019-prerelease",
          setCode: "s1",
          number: "ni0019-prerelease",
          cardType: "ni",
          grouping: "prerelease",
        },
      ],
      titles: [
        { printKey: "naruto:s1-ni0019", lang: "fr" },
        { printKey: "naruto:s1-ni0019-prerelease", lang: "fr" },
      ],
      assets: [
        {
          printKey: "naruto:s1-ni0019",
          lang: "fr",
          art: "art.carddass.jpg",
          thumb: null,
          back: null,
        },
      ],
    });
    expect(mirrored).toBe(1);
    expect(
      assets.find(
        (a) =>
          a.printKey === "naruto:s1-ni0019-prerelease" && a.lang === "fr",
      )?.art,
    ).toBe("art.carddass.jpg");
  });

  it("copies retail FR art onto promo stubs of the same collector number", () => {
    const { assets, mirrored } = mirrorNarutoAssetsAcrossCollectorNumbers({
      prints: [
        {
          printKey: "naruto:s2-te0034",
          setCode: "s2",
          number: "te0034",
          cardType: "te",
        },
        {
          printKey: "naruto:promo-te0034",
          setCode: "promo",
          number: "te0034-promo",
          cardType: "te",
          grouping: "promo",
        },
      ],
      titles: [
        { printKey: "naruto:s2-te0034", lang: "fr" },
        { printKey: "naruto:promo-te0034", lang: "fr" },
      ],
      assets: [
        {
          printKey: "naruto:s2-te0034",
          lang: "fr",
          art: "art.carddass.jpg",
          thumb: null,
          back: null,
        },
      ],
    });
    expect(mirrored).toBe(1);
    expect(
      assets.find((a) => a.printKey === "naruto:promo-te0034")?.art,
    ).toBe("art.carddass.jpg");
  });

  it("does not invent FR art on JA-only tourney promos off the checklist", () => {
    const { assets, mirrored } = mirrorNarutoAssetsAcrossCollectorNumbers({
      prints: [
        {
          printKey: "naruto:s3-te0107",
          setCode: "s3",
          number: "te0107",
          cardType: "te",
        },
        {
          printKey: "naruto:promo-te0107",
          setCode: "promo",
          number: "te0107-promo",
          cardType: "te",
          grouping: "promo",
        },
      ],
      titles: [
        { printKey: "naruto:s3-te0107", lang: "fr" },
        { printKey: "naruto:promo-te0107", lang: "fr" },
        { printKey: "naruto:promo-te0107", lang: "ja" },
      ],
      assets: [
        {
          printKey: "naruto:s3-te0107",
          lang: "fr",
          art: "art.carddass.jpg",
          thumb: null,
          back: null,
        },
      ],
    });
    expect(mirrored).toBe(0);
    expect(
      assets.find(
        (a) => a.printKey === "naruto:promo-te0107" && a.lang === "fr",
      ),
    ).toBeUndefined();
  });
});
