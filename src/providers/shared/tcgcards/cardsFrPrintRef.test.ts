/**
 * Map *cards.fr shop tiles / sealed preview links → local printKeys.
 *
 * One path for the whole Symfony family — see {@link cardsFrShopPrintKey}.
 */
import { describe, expect, it } from "vitest";

import {
  cardsFrShopPrintKey,
  mtgcardsSlugToPrintKey,
  printKeyFromBandaiCollectorRef,
  ygocardsTileToPrintKey,
} from "./cardsFrPrintRef";

describe("cardsFrPrintRef", () => {
  it("maps mtgcards slugs to Scryfall printKeys", () => {
    expect(mtgcardsSlugToPrintKey("tdm-fr-0001-m-ugin-loeil-des-tempetes")).toBe(
      "mtg:tdm-1",
    );
    expect(mtgcardsSlugToPrintKey("blb-fr-0280-c-somewhere")).toBe(
      "mtg:blb-280",
    );
    expect(mtgcardsSlugToPrintKey("not-a-card")).toBeNull();
  });

  it("maps ygocards tiles via hyphenated lang+number", () => {
    expect(
      ygocardsTileToPrintKey({
        slug: "agov-fr007-sr-lere-du-seigneur",
        lang: "fr",
      }),
    ).toBe("yugioh:agov-fr007");
  });

  it("maps ygocards tiles via CDN set folder + glued number", () => {
    expect(
      ygocardsTileToPrintKey({
        slug: "ra03001-sr-la-bonanza",
        lang: "fr",
        imageFront:
          "https://static.ygocards.fr/cards/fr/ra03/image-cartes-a-collectionner-yugioh-card-game-tcg-ra03001-sr-x.webp",
      }),
    ).toBe("yugioh:ra03-fr001");
  });

  it("shares one mapper for sealed preview + faces + prices", () => {
    expect(
      cardsFrShopPrintKey({
        game: "lorcana",
        print: {
          slug: "223-204-fr-12-jessie-cowgirl-energique",
          ref: "12-223",
        },
        resolveCatalogueSetId: ({ setCode }) =>
          setCode?.trim() === "12" ? "12" : null,
      }),
    ).toBe("lorcana:12-223");

    expect(
      cardsFrShopPrintKey({
        game: "pokemon",
        print: {
          slug: "asc-fr-276-pikachu",
          ref: "asc-276",
        },
        resolveCatalogueSetId: ({ setCode }) =>
          setCode?.toUpperCase() === "ASC" ? "me02.5" : null,
      }),
    ).toBe("pokemon:me02.5-276");

    expect(
      printKeyFromBandaiCollectorRef("onepiece", "st25-001"),
    ).toBe("onepiece:st25-001");

    expect(
      cardsFrShopPrintKey({
        game: "lorcana",
        print: { slug: "241-204-fr-12-jessie", ref: "241-204" },
      }),
    ).toBeNull();
  });
});
