/**
 * Tests for Chitoroshop DBC harvest — URL normalize, parse, set hint, match.
 */
import { describe, expect, it } from "vitest";

import {
  extractEnTitleFromChitoroshopProduct,
  extractPrintedFromChitoroshopProduct,
  extractSetHintFromChitoroshopProduct,
  facesFromChitoroshopProducts,
  matchChitoroshopToDbsjccPrint,
  normalizeChitoroshopImageUrl,
  type DbsjccPrintCandidate,
} from "./chitoroshop";

describe("normalizeChitoroshopImageUrl", () => {
  it("rewrites cdn.shopify.com to the shop CDN path", () => {
    expect(
      normalizeChitoroshopImageUrl(
        "https://cdn.shopify.com/s/files/1/0560/9589/9815/files/CartesDragonBall.jpg?v=1",
      ),
    ).toBe("https://chitoroshop.com/cdn/shop/files/CartesDragonBall.jpg");
  });

  it("keeps chitoroshop.com CDN urls and strips query", () => {
    expect(
      normalizeChitoroshopImageUrl(
        "https://chitoroshop.com/cdn/shop/files/a.jpg?v=9",
      ),
    ).toBe("https://chitoroshop.com/cdn/shop/files/a.jpg");
  });
});

describe("extractPrintedFromChitoroshopProduct", () => {
  it("parses D-205 from title", () => {
    expect(
      extractPrintedFromChitoroshopProduct({
        handle: "emperor-pilaf-d-205-dragon-ball-card-game",
        title: "Emperor Pilaf D-205 | Dragon Ball Card Game",
      }),
    ).toEqual({ printed: "D-205", number: "d0205" });
  });

  it("parses SP-7 from title", () => {
    expect(
      extractPrintedFromChitoroshopProduct({
        handle: "son-goku-sp-7-promo",
        title: "Son Goku SP-7 (Promo) | Dragon Ball Card Game",
      }),
    ).toEqual({ printed: "SP-7", number: "sp0007" });
  });
});

describe("extractSetHintFromChitoroshopProduct", () => {
  it("maps series N and Part N to partN", () => {
    expect(
      extractSetHintFromChitoroshopProduct(
        {
          title: "Emperor Pilaf D-205 | Dragon Ball Card Game",
          body_html:
            "<h1>Carte Dragon Ball | DRAGON BALL CARD GAME | series 2 (2003) | BANDAI</h1>",
          handle: "x",
        },
        "d0205",
      ),
    ).toBe("part2");

    expect(
      extractSetHintFromChitoroshopProduct(
        {
          title: "Android 13 D-584 | Dragon Ball Card Game",
          body_html:
            "<h1>Carte Dragon Ball | DRAGON BALL CARD GAME | PART 7 (2005) | BANDAI</h1>",
          handle: "x",
        },
        "d0584",
      ),
    ).toBe("part7");

    expect(
      extractSetHintFromChitoroshopProduct(
        {
          title: "Cell.Jr D-79 | Dragon Ball Card Game (Part 1)",
          body_html: "",
          handle: "x",
        },
        "d0079",
      ),
    ).toBe("part1");
  });

  it("forces SP printed numbers onto set sp even with Promo in title", () => {
    expect(
      extractSetHintFromChitoroshopProduct(
        {
          title: "Son Goku SP-7 (Promo) | Dragon Ball Card Game",
          body_html: "",
          handle: "x",
        },
        "sp0007",
      ),
    ).toBe("sp");
  });

  it("maps Filing Sheet Promo to promo", () => {
    expect(
      extractSetHintFromChitoroshopProduct(
        {
          title: "Spirit Sword! D-516 (Gold Rare / Glossy) | Dragon Ball Card Game",
          body_html:
            "<h1>Carte Super Dragon Ball Heroes | DRAGON BALL CARD GAME | Filing Sheet Promo | BANDAI</h1>",
          handle: "x",
        },
        "d0516",
      ),
    ).toBe("promo");
  });
});

describe("extractEnTitleFromChitoroshopProduct", () => {
  it("strips collector number and pipe suffix", () => {
    expect(
      extractEnTitleFromChitoroshopProduct({
        title: "Emperor Pilaf D-205 | Dragon Ball Card Game",
      }),
    ).toBe("Emperor Pilaf");
    expect(
      extractEnTitleFromChitoroshopProduct({
        title: "Spirit Sword! D-516 (Gold Rare / Glossy) | Dragon Ball Card Game",
      }),
    ).toBe("Spirit Sword!");
  });
});

describe("facesFromChitoroshopProducts", () => {
  it("dedupes by number and keeps shop CDN urls", () => {
    const faces = facesFromChitoroshopProducts([
      {
        handle: "a-d-205",
        title: "Emperor Pilaf D-205 | Dragon Ball Card Game",
        body_html: "series 2 (2003)",
        images: [
          {
            src: "https://cdn.shopify.com/s/files/1/x/files/a.jpg?v=1",
          },
        ],
      },
      {
        handle: "a-d-205-copie",
        title: "Emperor Pilaf D-205 (Copie) | Dragon Ball Card Game",
        body_html: "series 2",
        images: [
          {
            src: "https://cdn.shopify.com/s/files/1/x/files/b.jpg",
          },
        ],
      },
      {
        handle: "booster-pack",
        title: "Dragon Ball Card Game Pack Vol.6 (2004)",
        images: [{ src: "https://cdn.shopify.com/s/files/1/x/files/c.jpg" }],
      },
    ]);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.printed).toBe("D-205");
    expect(faces[0]!.number).toBe("d0205");
    expect(faces[0]!.setHint).toBe("part2");
    expect(faces[0]!.titleEn).toBe("Emperor Pilaf");
    expect(faces[0]!.url).toBe(
      "https://chitoroshop.com/cdn/shop/files/a.jpg",
    );
  });
});

describe("matchChitoroshopToDbsjccPrint", () => {
  const d0205: DbsjccPrintCandidate[] = [
    {
      printKey: "dbsjcc:part2-d0205",
      setCode: "part2",
      number: "d0205",
      grouping: null,
    },
    {
      printKey: "dbsjcc:promo-d0205",
      setCode: "promo",
      number: "d0205",
      grouping: null,
    },
  ];

  it("prefers Part hint over other sets", () => {
    expect(matchChitoroshopToDbsjccPrint("d0205", "part2", d0205)).toEqual({
      kind: "match",
      print: d0205[0],
    });
  });

  it("without hint prefers lowest partN over promo", () => {
    const many: DbsjccPrintCandidate[] = [
      {
        printKey: "dbsjcc:part4-d0129",
        setCode: "part4",
        number: "d0129",
        grouping: null,
      },
      {
        printKey: "dbsjcc:part1-d0129",
        setCode: "part1",
        number: "d0129",
        grouping: null,
      },
      {
        printKey: "dbsjcc:promo-d0129",
        setCode: "promo",
        number: "d0129",
        grouping: null,
      },
    ];
    expect(matchChitoroshopToDbsjccPrint("d0129", null, many)).toEqual({
      kind: "match",
      print: many[1],
    });
  });

  it("mints JA-only when set hint has no FR print", () => {
    expect(matchChitoroshopToDbsjccPrint("d0584", "part7", [])).toEqual({
      kind: "mint",
      setCode: "part7",
    });
  });

  it("skips when no hint and no FR print", () => {
    expect(matchChitoroshopToDbsjccPrint("d0584", null, [])).toEqual({
      kind: "skip",
      reason: "no FR print for d0584 and no set hint",
    });
  });

  it("prefers ungrouped when set has pouvoir variants", () => {
    const variants: DbsjccPrintCandidate[] = [
      {
        printKey: "dbsjcc:part4-d0431-kaio",
        setCode: "part4",
        number: "d0431",
        grouping: "kaio",
      },
      {
        printKey: "dbsjcc:part4-d0431",
        setCode: "part4",
        number: "d0431",
        grouping: null,
      },
    ];
    expect(matchChitoroshopToDbsjccPrint("d0431", "part4", variants)).toEqual({
      kind: "match",
      print: variants[1],
    });
  });
});
