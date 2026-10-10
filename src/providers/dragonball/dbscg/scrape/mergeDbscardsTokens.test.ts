import { describe, expect, it } from "vitest";

import type { DbscardsIndexEntry } from "@/providers/shared/tcgcards/list";

import {
  normalizeDbscardsTkRef,
  tokenCardsFromDbscardsEntries,
} from "./mergeDbscardsTokens";

function tile(
  partial: Partial<DbscardsIndexEntry> &
    Pick<DbscardsIndexEntry, "slug" | "name" | "ref">,
): DbscardsIndexEntry {
  return {
    itemId: null,
    sku: null,
    lang: null,
    priceText: null,
    price: null,
    currency: null,
    priceDeltaText: null,
    priceDelta: null,
    imageFront: null,
    imageBack: null,
    ...partial,
  };
}

describe("normalizeDbscardsTkRef", () => {
  it("pad à 3 chiffres (tk-01 → TK-001, tk-11 → TK-011)", () => {
    expect(normalizeDbscardsTkRef("tk-01")).toBe("TK-001");
    expect(normalizeDbscardsTkRef("TK-010")).toBe("TK-010");
    expect(normalizeDbscardsTkRef("tk-11")).toBe("TK-011");
    expect(normalizeDbscardsTkRef("BT1-001")).toBeNull();
  });
});

describe("tokenCardsFromDbscardsEntries", () => {
  it("fusionne FR+EN et préfère le titre de base au reprint championship", () => {
    const cards = tokenCardsFromDbscardsEntries(
      [
        tile({
          ref: "tk-01",
          slug: "tk-01-jeton-ombre",
          name: "Jeton Ombre",
          lang: "fr",
          imageFront: "https://static.dbscards.fr/cards/original/ombre.webp",
        }),
      ],
      [
        tile({
          ref: "tk-01",
          slug: "en-tk-01-championship-token-card-pack-2023-volume-1-shadow-token",
          name: "Shadow Token (Championship Token Card Pack 2023 Vol.1)",
          lang: "en",
          imageFront: "https://static.dbscards.fr/cards/en/champ.webp",
        }),
        tile({
          ref: "tk-01",
          slug: "en-tk-01-shadow-token",
          name: "Shadow Token",
          lang: "en",
          imageFront: "https://static.dbscards.fr/cards/en/shadow.webp",
        }),
      ],
    );

    expect(cards.map((c) => `${c.lang}:${c.name}:${c.printKey}`)).toEqual([
      "fr:Jeton Ombre:dbscg:tk-001",
      "en:Shadow Token:dbscg:tk-001",
    ]);
    expect(cards[0]?.cardType).toBe("JETON");
    expect(cards[1]?.imageUrl).toContain("shadow.webp");
  });
});
