import { describe, expect, it } from "vitest";

import {
  backfillSealedProductSetLogos,
  sealedGuaranteedPrintSignature,
  sealedProductSlugFamily,
  uniqueChapterSetFromGuarantees,
} from "./backfillLogos";
import type { SealedProductEntry } from "./indexFormat";

function entry(
  partial: Partial<SealedProductEntry> & Pick<SealedProductEntry, "slug">,
): SealedProductEntry {
  return {
    path: "",
    kind: "collector_box",
    behavior: "mixed_bundle",
    category: "collector-boxes",
    name: null,
    image: null,
    imageBack: null,
    setCardCount: null,
    setLogo: null,
    setCode: null,
    catalogueSetId: null,
    lang: "fr",
    releaseDate: null,
    priceCents: null,
    cardsPerPack: null,
    packsContained: null,
    guaranteedPrints: [],
    randomPoolScope: "none",
    randomPoolPrints: [],
    declaredCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: true,
    prints: [],
    ...partial,
  };
}

describe("sealedProductSlugFamily", () => {
  it("strips locale suffixes so FR/EN twins share a family", () => {
    expect(sealedProductSlugFamily("collection-starter-set-collector_box-en")).toBe(
      "collection-starter-set-collector_box",
    );
    expect(sealedProductSlugFamily("collection-starter-set-collector_box")).toBe(
      "collection-starter-set-collector_box",
    );
  });
});

describe("uniqueChapterSetFromGuarantees", () => {
  it("reads the unique chapter from in-set promos", () => {
    expect(
      uniqueChapterSetFromGuarantees(
        entry({
          slug: "scrooge",
          guaranteedPrints: [
            {
              name: "Scrooge",
              slug: "x",
              ref: null,
              printKey: "lorcana:10-36-p3",
            },
          ],
        }),
      ),
    ).toBe("10");
  });

  it("refuses standalone promo groupings (D23)", () => {
    expect(
      uniqueChapterSetFromGuarantees(
        entry({
          slug: "d23",
          guaranteedPrints: [
            {
              name: "Mickey",
              slug: "x",
              ref: null,
              printKey: "lorcana:1-1-d23",
            },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe("backfillSealedProductSetLogos", () => {
  it("fills empty logos via the pack owner without overwriting", () => {
    const products = {
      "pokemon::a": entry({
        slug: "booster-foudre-noire-zekrom",
        setCode: "BLK",
        name: "Booster",
      }),
      "pokemon::b": entry({
        slug: "already",
        setLogo: "https://keep.example/logo.png",
        setCode: "BLK",
      }),
    };
    backfillSealedProductSetLogos("no-such-pack", products);
    expect(products["pokemon::b"]?.setLogo).toBe(
      "https://keep.example/logo.png",
    );
    expect(products["pokemon::a"]?.setLogo).toBeNull();
  });

  it("copies logos across locale twins and shared guarantee lists", () => {
    const products = {
      "lorcana::fr": entry({
        slug: "collection-starter-set-collector_box",
        lang: "fr",
      }),
      "lorcana::en": entry({
        slug: "collection-starter-set-collector_box-en",
        lang: "en",
        setLogo: "https://example.test/fabled.png",
        catalogueSetId: "9",
      }),
      "lorcana::elsa-fr": entry({
        slug: "coffret-cadeau-fabuleux-elsa",
        setLogo: "/assets/lorcana/products/sets/set9/logo.png",
        catalogueSetId: "9",
        guaranteedPrints: [
          {
            name: "Elsa",
            slug: "e",
            ref: null,
            printKey: "lorcana:5-6-p3",
          },
        ],
      }),
      "lorcana::elsa-en": entry({
        slug: "elsa-gift-box-collector_box-en",
        lang: "en",
        guaranteedPrints: [
          {
            name: "Elsa",
            slug: "e",
            ref: null,
            printKey: "lorcana:5-6-p3",
          },
        ],
      }),
    };

    backfillSealedProductSetLogos("no-such-pack", products);

    expect(products["lorcana::fr"]?.setLogo).toBe(
      "https://example.test/fabled.png",
    );
    expect(products["lorcana::fr"]?.catalogueSetId).toBe("9");
    expect(products["lorcana::elsa-en"]?.setLogo).toBe(
      "/assets/lorcana/products/sets/set9/logo.png",
    );
    expect(sealedGuaranteedPrintSignature(products["lorcana::elsa-fr"]!)).toBe(
      sealedGuaranteedPrintSignature(products["lorcana::elsa-en"]!),
    );
  });
});
