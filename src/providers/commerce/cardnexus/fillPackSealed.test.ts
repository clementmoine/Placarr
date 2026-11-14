import { describe, expect, it } from "vitest";

import {
  cardnexusCategoryToSealedCategory,
  cardnexusSealedSlug,
  mapCardnexusSealedToEntry,
} from "./fillPackSealed";
import type { CardnexusSealedProduct } from "./sealed";

function sealed(
  partial: Partial<CardnexusSealedProduct> &
    Pick<CardnexusSealedProduct, "id" | "name">,
): CardnexusSealedProduct {
  return {
    gameId: "lorcana",
    nameSlug: null,
    expansionCode: "1",
    expansionId: 10,
    productCategory: "booster_box",
    imageUrl: "https://img.cardnexus.com/box.png",
    sourceUrl: `https://cardnexus.com/product/${partial.id}`,
    priceCents: 12000,
    languages: ["en"],
    externalIds: { cardmarket: [{ id: 999 }] },
    ...partial,
  };
}

describe("cardnexus sealed → SealedProductEntry", () => {
  it("maps booster_box category without inventing barcodes", () => {
    expect(cardnexusCategoryToSealedCategory("booster_box")).toBe("displays");
    const entry = mapCardnexusSealedToEntry(
      "lorcana",
      sealed({
        id: 10,
        name: "The First Chapter Booster Box",
        nameSlug: "the-first-chapter-booster-box",
      }),
    );
    expect(entry?.slug).toBe("the-first-chapter-booster-box");
    expect(entry?.kind).toBe("display");
    expect(entry?.priceCents).toBe(12000);
    expect(entry?.image).toContain("img.cardnexus.com");
    expect(entry?.setCode).toBe("1");
    expect(entry?.barcodes).toBeUndefined();
    expect(entry?.contentsKnown).toBe(false);
  });

  it("slugifies when nameSlug is absent", () => {
    expect(
      cardnexusSealedSlug(
        sealed({ id: 11, name: "Illumineer's Quest: Deep Trouble" }),
      ),
    ).toBe("illumineer-s-quest-deep-trouble");
  });
});
