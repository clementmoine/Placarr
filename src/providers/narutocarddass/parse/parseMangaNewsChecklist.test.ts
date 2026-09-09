import { describe, expect, it } from "vitest";

import {
  htmlToChecklistText,
  mangaNewsDeckImageUrl,
  normalizeCardNumber,
  parseMangaNewsChecklistText,
  uniqueNumbers,
} from "./parseMangaNewsChecklist";
import { pickTitleForNumber, titlesForPrints } from "../sources/mangaNewsTitles";

describe("parseMangaNewsChecklistText", () => {
  it("parses NI/TE/TA/CL lines with rarity", () => {
    const text = `
NI-01 Naruto Uzumaki / Holo
NI-04 Ino Yamanaka / Commune
TE-54 La Lame du vent / Holo
TA-190 La fête / Holo
CL-18 Koji / Commune
`;
    const lines = parseMangaNewsChecklistText(text);
    expect(lines).toEqual([
      {
        type: "ni",
        numberDigits: "1",
        number: "ni001",
        name: "Naruto Uzumaki",
        rarity: "holo",
        raw: "NI-01 Naruto Uzumaki / Holo",
      },
      {
        type: "ni",
        numberDigits: "4",
        number: "ni004",
        name: "Ino Yamanaka",
        rarity: "commune",
        raw: "NI-04 Ino Yamanaka / Commune",
      },
      {
        type: "te",
        numberDigits: "54",
        number: "te054",
        name: "La Lame du vent",
        rarity: "holo",
        raw: "TE-54 La Lame du vent / Holo",
      },
      {
        type: "ta",
        numberDigits: "190",
        number: "ta190",
        name: "La fête",
        rarity: "holo",
        raw: "TA-190 La fête / Holo",
      },
      {
        type: "cl",
        numberDigits: "18",
        number: "cl018",
        name: "Koji",
        rarity: "commune",
        raw: "CL-18 Koji / Commune",
      },
    ]);
  });

  it("ignores non-checklist noise and dedupes identical rows", () => {
    const text = `
Naruto - Deck Serie 1
NI-01 Naruto Uzumaki / Holo
NI-01 Naruto Uzumaki / Holo
Prix 8.00
`;
    expect(parseMangaNewsChecklistText(text)).toHaveLength(1);
  });

  it("keeps same number with different names (MN anomalies)", () => {
    const text = `
NI-73 Iwashi Tatami / Commune
NI-73 Serpent Géant / Commune
`;
    const lines = parseMangaNewsChecklistText(text);
    expect(lines).toHaveLength(2);
    expect(uniqueNumbers(lines)).toEqual(["ni073"]);
  });
});

describe("normalizeCardNumber", () => {
  it.each([
    ["ni", "1", "ni001"],
    ["ni", "023", "ni023"],
    ["ta", 190, "ta190"],
    ["cl", "27", "cl027"],
  ] as const)("%s %s → %s", (type, digits, expected) => {
    expect(normalizeCardNumber(type, digits)).toBe(expected);
  });
});

describe("htmlToChecklistText", () => {
  it("recovers checklist lines from HTML fragments", () => {
    const html = `<div><p>NI-203 Itachi Uchiwa / Holo</p><br/>TA-190 La fête / Holo</div>`;
    const lines = parseMangaNewsChecklistText(htmlToChecklistText(html));
    expect(lines.map((l) => l.number)).toEqual(["ni203", "ta190"]);
  });
});

describe("pickTitleForNumber", () => {
  it("prefers matching set then fullest name", () => {
    const picked = pickTitleForNumber(
      [
        {
          number: "ta190",
          name: "La fêt...",
          rarity: "holo",
          setHint: "s3",
        },
        {
          number: "ta190",
          name: "La fête",
          rarity: "holo",
          setHint: "s4",
        },
      ],
      "s4",
    );
    expect(picked?.name).toBe("La fête");
  });
});

describe("titlesForPrints", () => {
  it("attaches FR title to matching printKey", () => {
    const titles = titlesForPrints(
      [
        {
          printKey: "naruto:s4-ta190",
          setCode: "s4",
          number: "ta190",
          cardType: "ta",
        },
      ],
      [
        {
          number: "ta190",
          name: "La fête",
          rarity: "holo",
          setHint: "s4",
        },
      ],
    );
    expect(titles).toEqual([
      {
        printKey: "naruto:s4-ta190",
        lang: "fr",
        fullName: "La fête",
        rarity: "holo",
      },
    ]);
  });
});

describe("mangaNewsDeckImageUrl", () => {
  it("prefers the deck og:image over other goodie thumbs", () => {
    const html = `
      <meta property="og:image" content="https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg">
      <img src="/public/images/goodies/.spy-x-family-agenda.webp">
    `;
    expect(mangaNewsDeckImageUrl(html)).toBe(
      "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg",
    );
  });

  it("prefers the full packshot over the dotted _medium og:image", () => {
    const html = `
      <meta property="og:image" content="https://www.manga-news.com/public/images/goodies/.tcg-naruto-deck-serie-4_medium.jpg">
      <a href="https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-4.jpg">deck</a>
    `;
    expect(mangaNewsDeckImageUrl(html)).toBe(
      "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-4.jpg",
    );
  });
});
