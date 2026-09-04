import { describe, expect, it } from "vitest";

import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import {
  ebayItNamesCompatible,
  ebayItTitleCardsFromFaces,
  mergeEbayItTitlesIntoIndex,
  parseEbayItListingTitle,
  shouldAcceptEbayItTitle,
  softTitleCaseEbayItName,
} from "./parseEbayItTitles";

const ni002: NarutoPrintRow = {
  printKey: "naruto:ni-0002",
  setCode: "s1",
  number: "ni0002",
  cardType: "ni",
  family: "ninja",
};

const ta0165: NarutoPrintRow = {
  printKey: "naruto:ta-0165",
  setCode: "s4",
  number: "ta0165",
  cardType: "ta",
  family: "mission",
};

describe("parseEbayItListingTitle", () => {
  it("keeps short seller names", () => {
    expect(parseEbayItListingTitle("Sasuke Uchiha")).toBe("Sasuke Uchiha");
    expect(parseEbayItListingTitle("Gaara Posseduto")).toBe("Gaara Posseduto");
  });

  it("strips NARUTO TCG set + ref + condition wrappers", () => {
    expect(
      parseEbayItListingTitle(
        "NARUTO TCG LA FORZA DELLA FOGLIA BYAKUGAN TE-42 HOLO ITA NM",
      ),
    ).toBe("Byakugan");
    expect(
      parseEbayItListingTitle(
        "NARUTO TCG LA MALEDIZIONE DELLA SABBIA RAPIMENTO ST-142 HOLO ITA NM",
      ),
    ).toBe("Rapimento");
  });

  it("strips NARUTO CARD GAME wrappers", () => {
    expect(
      parseEbayItListingTitle(
        "NARUTO CARD GAME Lista Dei Ricercati ST-11 FOIL NM",
      ),
    ).toBe("Lista Dei Ricercati");
    expect(
      parseEbayItListingTitle("NARUTO CARD GAME Haku NI-322 FOIL NM"),
    ).toBe("Haku");
  });
});

describe("softTitleCaseEbayItName", () => {
  it("title-cases ALL CAPS fragments only", () => {
    expect(softTitleCaseEbayItName("BYAKUGAN")).toBe("Byakugan");
    expect(softTitleCaseEbayItName("Sasuke Uchiha")).toBe("Sasuke Uchiha");
  });
});

describe("ebayItNamesCompatible", () => {
  it("matches Uchiwa/Uchiha and ignores possession suffixes", () => {
    expect(ebayItNamesCompatible("Sasuke Uchiwa", "Sasuke Uchiha")).toBe(true);
    expect(
      ebayItNamesCompatible("Gaara (forme possédée)", "Gaara Posseduto"),
    ).toBe(true);
    expect(
      ebayItNamesCompatible("Naruto Uzumaki", "Illusione"),
    ).toBe(false);
  });
});

describe("shouldAcceptEbayItTitle", () => {
  it("rejects a mislabeled NI when FR latin disagrees", () => {
    const titles: NarutoTitleRow[] = [
      { printKey: "naruto:ni-0002", lang: "fr", fullName: "Zabuza Momochi" },
    ];
    expect(
      shouldAcceptEbayItTitle({
        cleaned: "Tecnica Del Mimetismo",
        print: ni002,
        titles,
      }),
    ).toBe(false);
  });

  it("accepts mission translations that do not share FR tokens", () => {
    const titles: NarutoTitleRow[] = [
      { printKey: "naruto:ta-0165", lang: "fr", fullName: "Amour" },
    ];
    expect(
      shouldAcceptEbayItTitle({
        cleaned: "Affetto",
        print: ta0165,
        titles,
      }),
    ).toBe(true);
  });
});

describe("mergeEbayItTitlesIntoIndex", () => {
  it("fills missing IT titles and skips incompatible NI listings", () => {
    const merged = mergeEbayItTitlesIntoIndex({
      prints: [ni002, ta0165],
      titles: [
        { printKey: "naruto:ni-0002", lang: "fr", fullName: "Sasuke Uchiwa" },
        { printKey: "naruto:ta-0165", lang: "fr", fullName: "Amour" },
      ],
      cards: [
        {
          number: "ni0002",
          name: "Sasuke Uchiha",
          printedRef: "NI-02",
          setCode: "s1",
        },
        {
          number: "ni0099",
          name: "Tecnica Inventata",
          printedRef: "NI-99",
          setCode: "s1",
        },
        {
          number: "ta0165",
          name: "Affetto",
          printedRef: "ST-165",
          setCode: "s4",
        },
      ],
    });
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:ni-0002" && t.lang === "it",
      ),
    ).toMatchObject({
      fullName: "Sasuke Uchiha",
      nameSource: "ebay-it-listing",
    });
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:ta-0165" && t.lang === "it",
      )?.fullName,
    ).toBe("Affetto");
    expect(merged.titled).toEqual(["naruto:ni-0002", "naruto:ta-0165"]);
    expect(merged.skipped.some((s) => s.startsWith("ni0099:"))).toBe(true);
  });

  it("reads real ebay.json IT faces into clean title cards", () => {
    const cards = ebayItTitleCardsFromFaces();
    expect(cards.length).toBeGreaterThan(100);
    expect(cards.find((c) => c.number === "ni0002")).toMatchObject({
      name: "Sasuke Uchiha",
    });
    expect(cards.find((c) => c.number === "te0042")).toMatchObject({
      name: "Byakugan",
    });
    // Errecards mislabeled eight TE scans as NI — ledger corrected to TE-N.
    expect(cards.find((c) => c.number === "te0018")).toMatchObject({
      name: "Tecnica Del Mimetismo",
      printedRef: "TE-18",
    });
    expect(cards.some((c) => c.number === "ni0018")).toBe(false);
  });
});
