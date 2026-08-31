import { describe, expect, it } from "vitest";

import {
  sealedBehaviorForKind,
  sealedContentsKnown,
  sealedKindForCategory,
} from "./kinds";
import {
  printKeyFromCollectorRef,
  sealedPriceCentsFromShop,
  sealedProductFromStaging,
} from "./ingest";
import { sealedProductKey } from "./indexFormat";

describe("sealedPriceCentsFromShop", () => {
  it("converts EUR shop strings to cents", () => {
    expect(sealedPriceCentsFromShop({ price: "3.88", currency: "EUR" })).toBe(
      388,
    );
    expect(sealedPriceCentsFromShop({ price: 4.9, currency: "EUR" })).toBe(490);
  });

  it("ignores non-EUR and empty prices", () => {
    expect(sealedPriceCentsFromShop({ price: "4.90", currency: "USD" })).toBeNull();
    expect(sealedPriceCentsFromShop({ price: null, currency: "EUR" })).toBeNull();
    expect(sealedPriceCentsFromShop({ price: "0", currency: "EUR" })).toBeNull();
  });
});

describe("sealed kinds", () => {
  it("maps host categories onto the four catalogue objects", () => {
    expect(sealedKindForCategory("boosters")).toBe("booster");
    expect(sealedKindForCategory("boosters-blister")).toBe("booster");
    expect(sealedKindForCategory("displays")).toBe("display");
    expect(sealedKindForCategory("decks")).toBe("deck");
    expect(sealedKindForCategory("commander-decks")).toBe("deck");
    expect(sealedKindForCategory("elite-trainer")).toBe("coffret");
    expect(sealedKindForCategory("trove-packs")).toBe("coffret");
    expect(sealedKindForCategory("illumineers-quest")).toBe("coffret");
    expect(sealedKindForCategory("puzzles")).toBeNull();
    expect(sealedKindForCategory("playmats")).toBeNull();
    expect(sealedBehaviorForKind("booster")).toBe("random_pack");
    expect(sealedBehaviorForKind("display")).toBe("pack_container");
    expect(sealedBehaviorForKind("deck")).toBe("known_bundle");
    expect(sealedBehaviorForKind("coffret")).toBe("mixed_bundle");
  });

  it("never treats a booster or display as known contents", () => {
    expect(
      sealedContentsKnown({
        kind: "booster",
        containsPrintsIsPreview: true,
        printCount: 15,
      }),
    ).toBe(false);
    expect(
      sealedContentsKnown({
        kind: "display",
        containsPrintsIsPreview: false,
        printCount: 0,
      }),
    ).toBe(false);
    expect(
      sealedContentsKnown({
        kind: "deck",
        containsPrintsIsPreview: false,
        printCount: 19,
      }),
    ).toBe(true);
    expect(
      sealedContentsKnown({
        kind: "deck",
        containsPrintsIsPreview: true,
        printCount: 15,
      }),
    ).toBe(false);
  });
});

describe("sealed ingest", () => {
  it("builds a product key that is not a printKey", () => {
    expect(sealedProductKey("dbs/cg", "sd23-starter-deck-final-radiance")).toBe(
      "dbs/cg::sd23-starter-deck-final-radiance",
    );
  });

  it("round-trips a Bandai collector ref and leaves a shop ref alone", () => {
    expect(printKeyFromCollectorRef("dbscg", "bt13-135")).toBe(
      "dbscg:bt13-135",
    );
    expect(printKeyFromCollectorRef("dbsfw", "fs10-01-p1")).toBe(
      "dbsfw:fs10-01-p1",
    );
    expect(printKeyFromCollectorRef("dbscg", "bt23-033-pr")).toBe(
      "dbscg:bt23-033-pr",
    );
    expect(printKeyFromCollectorRef("lorcana", "jessie")).toBeNull();
    // lorcards prints "241-204" for card 241 / 204 in the set — not set 241.
    expect(printKeyFromCollectorRef("lorcana", "241-204")).toBeNull();
    expect(printKeyFromCollectorRef("pokemon", "fr-38")).toBeNull();
  });

  it("keeps a Woody booster as a preview, not the chapter pool", () => {
    const entry = sealedProductFromStaging({
      packId: "lorcana",
      listing: {
        slug: "booster-set-12-contrees-inconnues-woody",
        path: "/products/boosters/booster-set-12-contrees-inconnues-woody",
        category: "boosters",
        image: "https://static.lorcards.fr/woody.webp",
      },
      page: {
        path: "/products/boosters/booster-set-12-contrees-inconnues-woody",
        slug: "booster-set-12-contrees-inconnues-woody",
        category: "boosters",
        name: "Booster Set 12 Contrées Inconnues - Woody",
        image: "https://static.lorcards.fr/woody.webp",
        sku: 2047,
        price: "4.90",
        currency: "EUR",
        setCode: "WIL",
        lang: "FR",
        releaseDate: "2026-03-01",
        declaredCardCount: 446,
        containsPrints: [
          {
            slug: "241-204-fr-12-jessie",
            path: "/cards/241-204-fr-12-jessie",
            ref: "241-204",
            sku: null,
            name: "Jessie",
          },
        ],
        containsPrintsIsPreview: true,
        relatedProducts: [],
        tables: {},
      },
    });
    expect(entry).toMatchObject({
      kind: "booster",
      behavior: "random_pack",
      contentsKnown: false,
      containsPrintsIsPreview: true,
      declaredCardCount: 446,
      priceCents: 490,
      /*
        « Booster Set 12 … » : le 12 est le n° de set, pas « 12 cartes ».
        Sans cette mention, cardsPerPack reste null — on n'invente pas.
      */
      cardsPerPack: null,
      packsContained: 1,
    });
    expect(entry?.prints).toHaveLength(1);
    expect(entry?.prints[0]?.printKey).toBeNull();
    expect(entry?.setLogo).toBeNull();
  });

  it("reads cards-per-pack from « N cartes » in the product name", () => {
    const entry = sealedProductFromStaging({
      packId: "lorcana",
      listing: {
        slug: "booster-premier-chapitre-malefique",
        path: "/products/boosters/booster-premier-chapitre-malefique",
        category: "boosters",
        image: "https://static.lorcards.fr/malefique.webp",
      },
      page: {
        path: "/products/boosters/booster-premier-chapitre-malefique",
        slug: "booster-premier-chapitre-malefique",
        category: "boosters",
        name: "Booster 12 cartes Premier Chapitre - Maléfique",
        image: "https://static.lorcards.fr/malefique.webp",
        sku: 1,
        price: "3.88",
        currency: "EUR",
        setCode: "FC",
        lang: "FR",
        releaseDate: "01/09/2023",
        declaredCardCount: 420,
        containsPrints: [],
        containsPrintsIsPreview: true,
        relatedProducts: [],
        tables: {},
      },
    });
    expect(entry).toMatchObject({
      cardsPerPack: 12,
      packsContained: 1,
      declaredCardCount: 420,
      priceCents: 388,
    });
  });

  it("reads packs-contained from a display slug without a name", () => {
    const entry = sealedProductFromStaging({
      packId: "lorcana",
      listing: {
        slug: "display-24-boosters-premier-chapitre",
        path: "/products/displays/display-24-boosters-premier-chapitre",
        category: "displays",
        image: null,
      },
      page: null,
    });
    expect(entry).toMatchObject({
      kind: "display",
      cardsPerPack: null,
      packsContained: 24,
    });
  });

  it("overlays the official Lorcana chapter thumb when the slug names the set", () => {
    const entry = sealedProductFromStaging({
      packId: "lorcana",
      listing: {
        slug: "booster-set-12-contrees-inconnues-woody",
        path: "/products/boosters/booster-set-12-contrees-inconnues-woody",
        category: "boosters",
        image: "https://static.lorcards.fr/woody.webp",
      },
      page: {
        path: "/products/boosters/booster-set-12-contrees-inconnues-woody",
        slug: "booster-set-12-contrees-inconnues-woody",
        category: "boosters",
        name: "Booster Set 12 Contrées Inconnues - Woody",
        image: "https://static.lorcards.fr/woody.webp",
        sku: 2047,
        price: "4.90",
        currency: "EUR",
        setCode: "WIL",
        lang: "FR",
        releaseDate: "2026-03-01",
        declaredCardCount: 446,
        containsPrints: [],
        containsPrintsIsPreview: true,
        relatedProducts: [],
        tables: {},
      },
      /*
        Le relevé de logos appartient au pack : le code partagé ne le connaît
        plus, il demande. Le test fournit donc le résolveur, comme le ferait le
        module qui possède ce catalogue.
      */
      resolveSetLogo: ({ setCode }) =>
        setCode === "WIL"
          ? "/assets/lorcana/products/sets/set12/logo.png"
          : null,
    });
    expect(entry?.setLogo).toBe("/assets/lorcana/products/sets/set12/logo.png");
    expect(entry?.setCode).toBe("WIL");
  });

  it("marks a completed DBS starter as known contents", () => {
    const entry = sealedProductFromStaging({
      packId: "dbs/cg",
      listing: {
        slug: "sd23-starter-deck-final-radiance",
        path: "/products/decks/sd23-starter-deck-final-radiance",
        category: "decks",
        image: null,
      },
      page: {
        path: "/products/decks/sd23-starter-deck-final-radiance",
        slug: "sd23-starter-deck-final-radiance",
        category: "decks",
        name: "SD23 Starter Deck Final Radiance",
        image: null,
        sku: null,
        price: null,
        currency: null,
        setCode: "SD23",
        lang: "FR",
        releaseDate: null,
        declaredCardCount: 19,
        containsPrints: [
          {
            slug: "sd23-007",
            path: "/cards/sd23-007",
            ref: "sd23-007",
            sku: null,
            name: "A",
          },
        ],
        containsPrintsIsPreview: false,
        relatedProducts: [],
        tables: {},
      },
    });
    expect(entry?.kind).toBe("deck");
    expect(entry?.contentsKnown).toBe(true);
    expect(entry?.prints[0]?.printKey).toBe("dbscg:sd23-007");
  });

  it("indexes a display from the listing alone", () => {
    const entry = sealedProductFromStaging({
      packId: "pokemon",
      listing: {
        slug: "display-sv08",
        path: "/products/displays/display-sv08",
        category: "displays",
        image: "https://static.pkmcards.fr/x.webp",
      },
    });
    expect(entry).toMatchObject({
      kind: "display",
      behavior: "pack_container",
      contentsKnown: false,
      image: "https://static.pkmcards.fr/x.webp",
      prints: [],
      setLogo: null,
    });
  });

  it("overlays the TCGdex wordmark when pkmcards setCode is unique", () => {
    const entry = sealedProductFromStaging({
      packId: "pokemon",
      listing: {
        slug: "booster-sv08-5-evolutions-prismatiques",
        path: "/products/boosters/booster-sv08-5-evolutions-prismatiques",
        category: "boosters",
        image: "https://static.pkmcards.fr/pre.webp",
      },
      page: {
        path: "/products/boosters/booster-sv08-5-evolutions-prismatiques",
        slug: "booster-sv08-5-evolutions-prismatiques",
        category: "boosters",
        name: "Booster EV8.5 Évolutions Prismatiques",
        image: "https://static.pkmcards.fr/pre.webp",
        sku: 1,
        price: "5.90",
        currency: "EUR",
        setCode: "PRE",
        lang: "FR",
        releaseDate: "2025-01-17",
        declaredCardCount: 10,
        containsPrints: [],
        containsPrintsIsPreview: true,
        relatedProducts: [],
        tables: {},
      },
      /*
        La fiche porte l'abréviation officielle (`PRE`) ; c'est le pack qui sait
        la rattacher à son set (`sv08.5`). Le bouchon reproduit ce lien plutôt
        que de le contourner.
      */
      resolveSetLogo: ({ setCode }) =>
        setCode === "PRE"
          ? "https://assets.tcgdex.net/fr/sv/sv08.5/logo.png"
          : null,
    });
    expect(entry?.setLogo).toBe(
      "https://assets.tcgdex.net/fr/sv/sv08.5/logo.png",
    );
    expect(entry?.setCode).toBe("PRE");
  });

  it("drops a puzzle — not a card SKU", () => {
    expect(
      sealedProductFromStaging({
        packId: "lorcana",
        listing: {
          slug: "puzzle-woody",
          path: "/products/puzzles/puzzle-woody",
          category: "puzzles",
          image: null,
        },
      }),
    ).toBeNull();
  });
});
