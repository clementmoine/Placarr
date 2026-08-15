import { describe, expect, it } from "vitest";

import {
  buildDbscardsIndex,
  dbscardsFrontFromBack,
  dbscardsIsBackImage,
  dbscardsListPageUrl,
  dbscardsSlugToPrintRef,
  lookupDbscardsEntry,
  parseDbscardsListPage,
} from "./dbscardsIndex";

const page = (items: Array<{ url: string; name: string; image: string }>) =>
  `<html><script type="application/ld+json">${JSON.stringify({
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({ position: i + 1, ...it })),
  })}</script></html>`;

describe("parseDbscardsListPage", () => {
  it("reads the card list their pages publish for search engines", () => {
    const rows = parseDbscardsListPage(
      page([
        {
          url: "https://www.dbscards.fr/cards/bt31-003-r-gogeta-ss",
          name: "Gogeta SS, Puissance invincible",
          image: "https://static.dbscards.fr/cards/fr/bt31/img-bt31-003.webp",
        },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("bt31-003-r-gogeta-ss");
  });

  it("yields nothing rather than throwing on a page without a list", () => {
    // The crawl walks hundreds of pages; one oddity must not lose the rest.
    expect(parseDbscardsListPage("<html>no ld+json</html>")).toEqual([]);
    expect(
      parseDbscardsListPage(
        '<script type="application/ld+json">{oops</script>',
      ),
    ).toEqual([]);
  });
});

describe("dbscardsSlugToPrintRef", () => {
  it("takes the collector part, before the rarity letters", () => {
    expect(dbscardsSlugToPrintRef("bt31-001-uc-gogeta-ss-fusion")).toBe(
      "bt31-001",
    );
  });

  it("tolerates the locale prefix their English slugs carry", () => {
    /*
      English slugs read `en-bt25-009-sr-…` where French ones start at the set.
      Missing this yielded zero references for the entire English list — 1920
      entries silently indexed as nothing.
    */
    expect(
      dbscardsSlugToPrintRef("en-bt25-009-sr-event-pack-17-son-goku"),
    ).toBe("bt25-009");
  });

  it("keeps a two-digit number as printed", () => {
    expect(dbscardsSlugToPrintRef("ex10-05-ex-docteur-willow")).toBe("ex10-05");
  });
});

describe("lookupDbscardsEntry", () => {
  const index = buildDbscardsIndex([
    { slug: "bt31-001-uc-gogeta", name: "", image: "a.webp" },
    { slug: "bt31-001-slr-gogeta", name: "", image: "b.webp" },
  ]);

  it("narrows several prints of one code by rarity", () => {
    // `uc` and `slr` are different prints of the same card, different art.
    expect(lookupDbscardsEntry(index, "bt31-001", "slr")?.image).toBe("b.webp");
  });

  it("answers with something rather than nothing on an unknown rarity", () => {
    // A face from the right card beats no face at all.
    expect(lookupDbscardsEntry(index, "bt31-001", "zzz")?.image).toBe("a.webp");
  });

  it("has no answer for a code it does not carry", () => {
    expect(lookupDbscardsEntry(index, "bt99-999", "c")).toBeNull();
  });
});

describe("Leader sides", () => {
  it("derives the front from the back their list points at", () => {
    const back = "https://static.dbscards.fr/cards/fr/bt1/img-champa-back.webp";
    expect(dbscardsIsBackImage(back)).toBe(true);
    expect(dbscardsFrontFromBack(back)).toBe(
      "https://static.dbscards.fr/cards/fr/bt1/img-champa.webp",
    );
  });
});

describe("dbscardsListPageUrl", () => {
  it("names the locale instead of relying on the site default", () => {
    expect(dbscardsListPageUrl(1, "fr")).toMatch(/liste-cartes-francaises$/);
    expect(dbscardsListPageUrl(3, "en")).toMatch(/liste-cartes-anglaises\/3$/);
  });

  it("refuses a locale their site publishes no list for", () => {
    expect(() => dbscardsListPageUrl(1, "ja")).toThrow();
  });
});
