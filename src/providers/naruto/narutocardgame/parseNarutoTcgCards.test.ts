import { describe, expect, it } from "vitest";

import {
  narutoTcgCardsIdentity,
  parseNarutoTcgCardsDetail,
  parseNarutoTcgCardsListingSlugs,
  pickNarutoTcgCardsFacePath,
} from "./parseNarutoTcgCards";

describe("narutoTcgCardsIdentity", () => {
  it.each([
    ["demo-decks-n-001-naruto-uzumaki", { setCode: "demo", number: "n001" }],
    ["demo-decks-k-039-kakashi-hatake", { setCode: "demo", number: "k039" }],
    ["demo-decks-orochimaru", { setCode: "demo", number: "n017" }],
    ["demo-decks-choji-akimichi", { setCode: "demo", number: "n002" }],
    [
      "cp-001-chakra-card-Yankee-Stadium",
      { setCode: "promo", number: "cp001", grouping: "yankees" },
    ],
    [
      "cp-001-chakra-card-gencon-2026",
      { setCode: "promo", number: "cp001", grouping: "gencon" },
    ],
    ["cp-001", { setCode: "promo", number: "cp001", grouping: "event" }],
    [
      "premium-card-collection-vol-00-c-001-chakra-card-naruto-uzumaki",
      { setCode: "premium00", number: "c001", grouping: "premiumvol00" },
    ],
    ["preview-reveals-orochimaru", { setCode: "preview", number: "g01" }],
    [
      "preview-reveals-naruto-uzumaki-jinchuriki",
      { setCode: "preview", number: "g12" },
    ],
    ["accessories", null],
    ["sets", null],
  ] as const)("%s", (slug, expected) => {
    expect(narutoTcgCardsIdentity(slug)).toEqual(expected);
  });
});

describe("parseNarutoTcgCards HTML", () => {
  it("lists card slugs and skips nav", () => {
    const html = `
      <a href="/cards/sets">Sets</a>
      <a href="/cards/demo-decks-n-001-naruto-uzumaki">N-001</a>
      <a href="/cards/accessories">Acc</a>
    `;
    expect(parseNarutoTcgCardsListingSlugs(html)).toEqual([
      "demo-decks-n-001-naruto-uzumaki",
    ]);
  });

  it("picks full-size face and parses detail", () => {
    expect(
      pickNarutoTcgCardsFacePath([
        "/images/cards/N-001-w160.webp",
        "/images/cards/N-001.webp",
      ]),
    ).toBe("/images/cards/N-001.webp");

    const entry = parseNarutoTcgCardsDetail(
      `<title>Naruto — Hub</title><h1>Naruto Uzumaki</h1>
       <meta property="og:image" content="https://narutotcgcards.com/images/cards/N-001.webp">`,
      "demo-decks-n-001-naruto-uzumaki",
    );
    expect(entry).toMatchObject({
      slug: "demo-decks-n-001-naruto-uzumaki",
      name: "Naruto Uzumaki",
      facePath: "/images/cards/N-001.webp",
    });
  });
});
