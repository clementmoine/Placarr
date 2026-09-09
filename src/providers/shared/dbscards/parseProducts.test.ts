import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  dbscardsListingRowFromPath,
  dbscardsProductListingUrl,
  parseDbscardsProductListing,
  parseDbscardsProductPage,
  tcgCardsStaticProductImage,
} from "./parseProducts";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("tcgCardsStaticProductImage", () => {
  it("lowercases the locale folder Apache actually serves", () => {
    expect(
      tcgCardsStaticProductImage(
        "https://static.lorcards.fr/products/FR/collector-boxes/box.webp",
      ),
    ).toBe("https://static.lorcards.fr/products/fr/collector-boxes/box.webp");
    expect(
      tcgCardsStaticProductImage(
        "https://static.lorcards.fr/products/EN/collector-boxes/d23.webp",
      ),
    ).toBe("https://static.lorcards.fr/products/en/collector-boxes/d23.webp");
  });
});

describe("dbscardsProductListingUrl", () => {
  it("paginates with a path segment, not ?page=, and asks for every language", () => {
    expect(
      dbscardsProductListingUrl("https://www.dbscards.fr", "boosters"),
    ).toBe("https://www.dbscards.fr/products/boosters?language=ALL");
    expect(
      dbscardsProductListingUrl("https://www.dbscards.fr", "boosters", 2),
    ).toBe("https://www.dbscards.fr/products/boosters/2?language=ALL");
  });
});

describe("dbscardsListingRowFromPath", () => {
  it("keeps a sealed fiche and drops accessories and pagination", () => {
    expect(
      dbscardsListingRowFromPath(
        "/products/collector-boxes/coffret-collector-d23-2024",
      ),
    ).toEqual(
      expect.objectContaining({
        category: "collector-boxes",
        slug: "coffret-collector-d23-2024",
        detailArchived: true,
      }),
    );
    expect(
      dbscardsListingRowFromPath("/products/pins/pins-lorcana-d23-expo-2024"),
    ).toBeNull();
    expect(dbscardsListingRowFromPath("/products/boosters/2")).toBeNull();
  });
});

describe("parseDbscardsProductListing", () => {
  it("unions ItemList and hrefs, drops pagination slugs", () => {
    const rows = parseDbscardsProductListing(
      fixture("dbscards-product-listing.html"),
      "decks",
    );
    expect(rows.map((row) => row.slug)).toEqual([
      "sd23-starter-deck-final-radiance",
      "sd01-the-awakening",
    ]);
    expect(rows[0]?.image).toMatch(/sd23-starter-deck-final-radiance\.webp$/);
    expect(rows[0]?.detailArchived).toBe(true);
  });

  it("opens booster fiches for the labelled 15-tile preview", () => {
    const rows = parseDbscardsProductListing(
      `<a href="/products/boosters/booster-b02-union-force">x</a>`,
      "boosters",
    );
    expect(rows).toEqual([
      expect.objectContaining({
        slug: "booster-b02-union-force",
        detailArchived: true,
      }),
    ]);
  });

  it("leaves displays on the listing", () => {
    const rows = parseDbscardsProductListing(
      `<a href="/products/displays/boite-de-24-boosters-bt2-union-force">x</a>`,
      "displays",
    );
    expect(rows[0]?.detailArchived).toBe(false);
  });

  it("matches a packshot whose filename ends with the slug", () => {
    const rows = parseDbscardsProductListing(
      `<a href="/products/boosters/booster-set-12-contrees-inconnues-woody">x</a>
       <img data-src="https://static.lorcards.fr/products/fr/boosters/image-cartes-a-collectionner-lorcana-disney-game-tcg-lorcanacards-booster-set-12-contrees-inconnues-woody.webp" />`,
      "boosters",
    );
    expect(rows[0]?.image).toMatch(
      /lorcanacards-booster-set-12-contrees-inconnues-woody\.webp$/,
    );
  });

  it("keeps a quest box after lorcards moved it out of collector-boxes", () => {
    const rows = parseDbscardsProductListing(
      `<a href="/products/illumineers-quest/coffret-quete-des-illumineurs-vol-au-palais">x</a>
       <img data-src="https://static.lorcards.fr/products/FR/illumineers-quest/image-cartes-a-collectionner-lorcana-disney-game-tcg-lorcanacards-coffret-quete-des-illumineurs-vol-au-palais.webp" />`,
      "illumineers-quest",
    );
    expect(rows).toEqual([
      expect.objectContaining({
        slug: "coffret-quete-des-illumineurs-vol-au-palais",
        category: "illumineers-quest",
        detailArchived: true,
        image:
          "https://static.lorcards.fr/products/fr/illumineers-quest/image-cartes-a-collectionner-lorcana-disney-game-tcg-lorcanacards-coffret-quete-des-illumineurs-vol-au-palais.webp",
      }),
    ]);
  });
});

describe("parseDbscardsProductPage", () => {
  it("reads declared count, preview tiles, and release date", () => {
    const page = parseDbscardsProductPage(
      fixture("dbscards-product-deck.html"),
      "/products/decks/sd23-starter-deck-final-radiance",
      "decks",
    );
    expect(page.name).toMatch(/Final Radiance/);
    expect(page.setCode).toBe("SD23");
    expect(page.releaseDate).toBe("08/09/2023");
    expect(page.declaredCardCount).toBe(19);
    expect(page.containsPrints).toHaveLength(2);
    expect(page.containsPrints[0]?.ref).toBe("sd23-007");
    expect(page.containsPrints[1]?.ref).toBe("bt13-135");
    expect(page.containsPrintsIsPreview).toBe(true);
    expect(page.relatedProducts).toEqual([
      "/products/boosters/booster-bt23-perfect-combination",
    ]);
    expect(page.price).toBe("13.89");
  });

  it("keeps a booster preview short of the declared set pool", () => {
    const page = parseDbscardsProductPage(
      fixture("dbscards-product-booster.html"),
      "/products/boosters/booster-b02-union-force",
      "boosters",
    );
    expect(page.setCode).toBe("BT2");
    expect(page.releaseDate).toBe("20/04/2018");
    expect(page.declaredCardCount).toBe(127);
    expect(page.containsPrints).toHaveLength(2);
    expect(page.containsPrintsIsPreview).toBe(true);
    expect(page.relatedProducts).toEqual([
      "/products/displays/boite-de-24-boosters-bt2-union-force",
    ]);
  });

  it("reads a lorcards booster the same way, and keeps the chapter pool as a preview", () => {
    const page = parseDbscardsProductPage(
      fixture("lorcards-product-booster.html"),
      "/products/boosters/booster-set-12-contrees-inconnues-woody",
      "boosters",
    );
    expect(page.name).toMatch(/Woody/);
    expect(page.setCode).toBe("WIL");
    expect(page.releaseDate).toBe("15/05/2026");
    expect(page.declaredCardCount).toBe(446);
    expect(page.containsPrints).toHaveLength(2);
    expect(page.containsPrintsIsPreview).toBe(true);
    expect(page.containsPrints[0]?.slug).toBe(
      "223-204-fr-12-jessie-cowgirl-energique",
    );
    expect(page.relatedProducts).toEqual([
      "/products/boosters/booster-set-12-contrees-inconnues-merida",
    ]);
  });
});
