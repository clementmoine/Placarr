import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDbscardsIndex,
  dbscardsFrontFromBack,
  dbscardsIsBackImage,
  dbscardsListPageUrl,
  dbscardsPrintRef,
  dbscardsSlugToPrintRef,
  lookupDbscardsEntry,
  parseDbscardsListPage,
  type DbscardsIndexEntry,
} from "./dbscardsIndex";
import type { DbscardsTile } from "./dbscardsTile";

const listPage = readFileSync(
  path.join(__dirname, "fixtures", "dbscards-list-fr.html"),
  "utf8",
);

const entry = (over: Partial<DbscardsIndexEntry>): DbscardsIndexEntry =>
  ({
    itemId: null,
    slug: "",
    ref: null,
    sku: null,
    name: "",
    lang: null,
    priceText: null,
    price: null,
    currency: null,
    priceDeltaText: null,
    priceDelta: null,
    imageFront: null,
    imageBack: null,
    image: "",
    ...over,
  }) satisfies DbscardsTile & { image: string };

describe("parseDbscardsListPage", () => {
  it("reads every tile the page renders, not only those it publishes", () => {
    /*
      On the live pages the `ItemList` names 15 cards where the markup renders
      30. Reading the list built an index that was silently half the catalogue,
      and a card in the unpublished half was indistinguishable from one the site
      does not carry — which is how three real cards got reported as missing.
      The fixture keeps that shape at 4 tiles for 2 published entries.
    */
    const rows = parseDbscardsListPage(listPage);
    const listed = (listPage.match(/"@type"\s*:\s*"ListItem"/g) ?? []).length;
    expect(listed).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(listed);
    expect(rows).toHaveLength(4);
  });

  it("takes nothing from the `ItemList`, which repeats what tiles carry", () => {
    /*
      Measured on a full page: all fifteen images it publishes are byte-equal to
      a face the tile already holds, and it names no slug the tiles miss. The
      entry is the tile, with no field sourced from the structured data.
    */
    const rows = parseDbscardsListPage(listPage);
    expect(rows.every((row) => row.image === undefined)).toBe(true);
  });

  it("carries the price and both faces, which the list never held", () => {
    const rows = parseDbscardsListPage(listPage);
    const slr = rows.find((row) => row.sku === "BT31-001-SLR");
    expect(slr?.price).toBe(108);
    expect(slr?.currency).toBe("EUR");
    // The thirty-day move is a separate span that must not be read as the price.
    expect(slr?.priceDelta).toBe(-1.99);
    expect(slr?.imageFront).toMatch(/bt31-001-slr-.*-back\.webp$/);
    expect(slr?.imageBack).toMatch(/bt31-001-slr-[^/]*\.webp$/);
  });

  it("takes the image from `data-src`, never the lazy-loading placeholder", () => {
    // `src` is a shared card back; reading it collects one generic file 7770 times.
    for (const row of parseDbscardsListPage(listPage)) {
      expect(row.imageFront).not.toMatch(/cards\/original\/back\.webp$/);
    }
  });

  it("yields nothing rather than throwing on a page with no tiles", () => {
    // The crawl walks hundreds of pages; one oddity must not lose the rest.
    expect(parseDbscardsListPage("<html>no tiles</html>")).toEqual([]);
    expect(
      parseDbscardsListPage(
        '<script type="application/ld+json">{oops</script>',
      ),
    ).toEqual([]);
  });
});

describe("dbscardsPrintRef — the printed code beats the slug", () => {
  it("reads a promo whose slug hides behind a locale prefix", () => {
    /*
      `en-p-082-pr-…`: the prefix was only stripped when the set code held a
      digit, so `p-082` kept its `en-`, the reference regex read `en` as the
      set, and 555 English tiles — every promo — carried no reference at all.
    */
    expect(dbscardsSlugToPrintRef("en-p-082-pr-event-pack-17-vegeta")).toBe(
      "p-082",
    );
    expect(
      dbscardsPrintRef({ sku: "P-082-PR", slug: "en-p-082-pr-vegeta" }),
    ).toBe("p-082");
  });

  it("prefers the padded code their own title prints", () => {
    // Their slug says `ex2-01`, their title `EX02-01-EX`; the catalogue says
    // `ex02-01`, so reading the slug lost the whole set.
    expect(
      dbscardsPrintRef({
        sku: "EX02-01-EX",
        slug: "ex2-01-ex-time-patrol-trunks",
      }),
    ).toBe("ex02-01");
  });

  it("falls back to the slug when the tile prints no code", () => {
    expect(dbscardsPrintRef({ sku: null, slug: "bt31-001-uc-gogeta" })).toBe(
      "bt31-001",
    );
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
    entry({ slug: "bt31-001-uc-gogeta", image: "a.webp" }),
    entry({ slug: "bt31-001-slr-gogeta", image: "b.webp" }),
  ]);

  it("narrows several prints of one code by rarity", () => {
    // `uc` and `slr` are different prints of the same card, different art.
    expect(lookupDbscardsEntry(index, "bt31-001", "slr")?.image).toBe("b.webp");
  });

  it("narrows on the printed code when the slug spells the set differently", () => {
    const ex = buildDbscardsIndex([
      entry({ slug: "ex2-01-ex-trunks", sku: "EX02-01-EX", image: "a.webp" }),
      entry({ slug: "ex2-01-pr-trunks", sku: "EX02-01-PR", image: "b.webp" }),
    ]);
    expect(lookupDbscardsEntry(ex, "ex02-01", "pr")?.image).toBe("b.webp");
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
