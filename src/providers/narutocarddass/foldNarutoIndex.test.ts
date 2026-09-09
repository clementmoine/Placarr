import { describe, expect, it } from "vitest";

import {
  decodeNarutoHtmlEntities,
  foldNarutoCardsIndex,
  foldNarutoCatalogueRecords,
  isImplausibleNarutoTitle,
  pickBetterNarutoTitle,
} from "./foldNarutoIndex";

describe("isImplausibleNarutoTitle", () => {
  it("rejects scrape leftovers and keeps real names", () => {
    expect(isImplausibleNarutoTitle("qui")).toBe(true);
    expect(isImplausibleNarutoTitle("Carte NI-064")).toBe(true);
    expect(isImplausibleNarutoTitle("Kakashi Hatake")).toBe(false);
    expect(isImplausibleNarutoTitle("Ino")).toBe(false);
  });
});

describe("decodeNarutoHtmlEntities", () => {
  it("cleans aria-label leftovers like Let&#x27;s", () => {
    expect(decodeNarutoHtmlEntities("Let&#x27;s Take it Outside")).toBe(
      "Let's Take it Outside",
    );
    expect(
      pickBetterNarutoTitle(
        "Let&#x27;s Take it Outside",
        "Let's Take it Outside",
      ),
    ).toBe("Let's Take it Outside");
  });
});

describe("foldNarutoCardsIndex", () => {
  it("collapses s6-ni064 onto the retail Kakashi print", () => {
    const folded = foldNarutoCardsIndex({
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0064": {
          set: "ninja",
          card: "ni0064",
          name: "Kakashi Hatake",
          rarity: "holo",
          langs: {
            fr: { name: "Kakashi Hatake", art: "art.jpg" },
            it: { name: "Kakashi Hatake" },
          },
        },
        "naruto:s6-ni064": {
          set: "s6",
          card: "ni064",
          name: "qui",
          langs: { fr: { name: "qui", printed: false } },
        },
      },
    });
    expect(Object.keys(folded.cards)).toEqual(["naruto:ni-0064"]);
    const entry = folded.cards["naruto:ni-0064"];
    expect(entry?.name).toBe("Kakashi Hatake");
    expect(entry?.langs.fr).toMatchObject({
      name: "Kakashi Hatake",
      art: "art.jpg",
    });
    expect(entry?.langs.fr?.printed).toBeUndefined();
    expect(entry?.langs.it?.name).toBe("Kakashi Hatake");
  });

  it("collapses an unpadded ni-086 stub onto ni-0086", () => {
    const folded = foldNarutoCardsIndex({
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0086": {
          set: "ninja",
          card: "ni0086",
          name: "Sasuke Uchiwa",
          langs: { fr: { name: "Sasuke Uchiwa", art: "art.jpg" } },
        },
        "naruto:ni-086": {
          set: "s6",
          card: "ni086",
          name: "Sasuke Uchiwa",
          langs: { fr: { name: "Sasuke Uchiwa", printed: false } },
        },
      },
    });
    expect(Object.keys(folded.cards)).toEqual(["naruto:ni-0086"]);
    expect(folded.cards["naruto:ni-0086"]?.langs.fr).toMatchObject({
      name: "Sasuke Uchiwa",
      art: "art.jpg",
    });
    expect(folded.cards["naruto:ni-0086"]?.langs.fr?.printed).toBeUndefined();
  });
});

describe("foldNarutoCatalogueRecords", () => {
  it("drops the old series key and the junk FR title", () => {
    const folded = foldNarutoCatalogueRecords({
      prints: [
        {
          printKey: "naruto:ni-0064",
          setCode: "s2",
          number: "ni0064",
          cardType: "ni",
          family: "ninja",
        },
        {
          printKey: "naruto:s6-ni064",
          setCode: "s6",
          number: "ni064",
          cardType: "ni",
        },
      ],
      titles: [
        {
          printKey: "naruto:ni-0064",
          lang: "fr",
          fullName: "Kakashi Hatake",
        },
        {
          printKey: "naruto:s6-ni064",
          lang: "fr",
          fullName: "qui",
        },
      ],
      assets: [
        {
          printKey: "naruto:ni-0064",
          lang: "fr",
          art: "art.jpg",
        },
      ],
    });
    expect(folded.prints.map((p) => p.printKey)).toEqual(["naruto:ni-0064"]);
    expect(folded.prints[0]?.setCode).toBe("s2");
    expect(folded.titles).toEqual([
      {
        printKey: "naruto:ni-0064",
        lang: "fr",
        fullName: "Kakashi Hatake",
        rarity: null,
      },
    ]);
    expect(folded.assets[0]?.printed).not.toBe(false);
  });

  it("unionne setCodes multi-série sans inventer s6", () => {
    const folded = foldNarutoCatalogueRecords({
      prints: [
        {
          printKey: "naruto:ni-0049",
          setCode: "s1",
          setCodes: ["s1", "s5"],
          number: "ni0049",
          cardType: "ni",
        },
        {
          printKey: "naruto:ni-0049",
          setCode: "s5",
          number: "ni0049",
          cardType: "ni",
        },
      ],
    });
    expect(folded.prints).toHaveLength(1);
    expect(folded.prints[0]?.setCode).toBe("s1");
    expect(folded.prints[0]?.setCodes).toEqual(["s1", "s5"]);
  });
});
