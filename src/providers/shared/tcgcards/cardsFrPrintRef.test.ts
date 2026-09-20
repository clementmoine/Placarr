import { describe, expect, it } from "vitest";

import {
  mtgcardsSlugToPrintKey,
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
});
