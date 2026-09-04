import { describe, expect, it } from "vitest";

import {
  mergeNarutoCardsNetIntoIndex,
  parseNarutoCardsNetCardUrl,
  parseNarutoCardsNetSitemap,
  printedRefFromNarutoCardsNetSuffix,
  slugToNarutoCardsNetName,
} from "./parseNarutoCardsNet";

describe("printedRefFromNarutoCardsNetSuffix", () => {
  it.each([
    ["n", "-069", "N-069"],
    ["n", "-us069", "N-US069"],
    ["pr", "-us001", "PR-US001"],
  ] as const)("maps %s %s → %s", (type, suffix, ref) => {
    expect(printedRefFromNarutoCardsNetSuffix(type, suffix)).toBe(ref);
  });
});

describe("parseNarutoCardsNetCardUrl", () => {
  it("parses a US exclusive slug", () => {
    expect(
      parseNarutoCardsNetCardUrl(
        "https://narutocards.net/card/gaara-of-the-desert-n-us069/",
      ),
    ).toMatchObject({
      number: "nus0069",
      name: "Gaara Of The Desert",
      printedRef: "N-US069",
    });
  });

  it("parses a tin PR-US promo slug", () => {
    expect(
      parseNarutoCardsNetCardUrl(
        "https://narutocards.net/card/naruto-uzumaki-pr-us001/",
      ),
    ).toMatchObject({
      number: "prus0001",
      name: "Naruto Uzumaki",
      printedRef: "PR-US001",
    });
  });
});

describe("parseNarutoCardsNetSitemap", () => {
  it("dedupes card locs from sitemap xml", () => {
    const cards = parseNarutoCardsNetSitemap(`
      <urlset>
        <url><loc>https://narutocards.net/card/gaara-of-the-desert-n-us069/</loc></url>
        <url><loc>https://narutocards.net/card/yukie-fujikaze-c-us001/</loc></url>
      </urlset>
    `);
    expect(cards.map((c) => c.number)).toEqual(["cus0001", "nus0069"]);
  });
});

describe("mergeNarutoCardsNetIntoIndex", () => {
  it("fills EN titles on existing prints only", () => {
    const merged = mergeNarutoCardsNetIntoIndex({
      prints: [
        {
          printKey: "naruto:nus-0069",
          setCode: "s9",
          number: "nus0069",
          cardType: "nus",
          family: "ninja",
        },
      ],
      titles: [],
      cards: [
        {
          number: "nus0069",
          name: "Gaara Of The Desert",
          printedRef: "N-US069",
          slug: "gaara-of-the-desert-n-us069",
          pageUrl: "https://narutocards.net/card/gaara-of-the-desert-n-us069/",
        },
        {
          number: "n9999",
          name: "Ghost Card",
          printedRef: "N-9999",
          slug: "ghost-n-9999",
          pageUrl: "https://narutocards.net/card/ghost-n-9999/",
        },
      ],
    });
    expect(merged.titled).toEqual(["naruto:nus-0069"]);
    expect(merged.titles).toHaveLength(1);
    expect(merged.titles[0]).toMatchObject({
      nameSource: "narutocards-net:slug",
    });
    expect(merged.addedPrints).toEqual([]);
  });
});

describe("slugToNarutoCardsNetName", () => {
  it("title-cases hyphenated slug fragments", () => {
    expect(slugToNarutoCardsNetName("8-trigrams-palms-rotation")).toBe(
      "8 Trigrams Palms Rotation",
    );
  });
});
