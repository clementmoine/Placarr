import { describe, expect, it } from "vitest";

import { mirrorNarutoAssetsAcrossCollectorNumbers } from "./scrapeCards";

describe("mirrorNarutoAssetsAcrossCollectorNumbers", () => {
  it("copies art onto sister printKeys that share the collector number", () => {
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
    expect(mirrored).toBe(1);
    expect(
      assets.find((a) => a.printKey === "naruto:maki1-ni0017" && a.lang === "ja")
        ?.art,
    ).toBe("art.suruga.jpg");
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
});
