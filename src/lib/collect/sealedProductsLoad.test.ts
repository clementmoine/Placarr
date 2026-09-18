import { describe, expect, it } from "vitest";

import {
  dedupeSealedEntriesBySlug,
  toBuyProduct,
  toContainmentProduct,
} from "./sealedProductsLoad";
import type { SealedProductEntry } from "@/providers/shared/sealedProducts/indexFormat";

function entry(
  over: Partial<SealedProductEntry> & Pick<SealedProductEntry, "slug" | "kind" | "behavior">,
): SealedProductEntry {
  return {
    path: "",
    category: "",
    name: over.name ?? over.slug,
    image: null,
    imageBack: null,
    setLogo: null,
    setCode: null,
    lang: null,
    releaseDate: null,
    priceCents: null,
    cardsPerPack: null,
    packsContained: null,
    guaranteedPrints: [],
    randomPoolScope: "unknown",
    randomPoolPrints: [],
    declaredCardCount: null,
    setCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: false,
    prints: [],
    ...over,
  };
}

describe("dedupeSealedEntriesBySlug", () => {
  it("keeps one display-s24 and prefers the carddass key", () => {
    const rows = dedupeSealedEntriesBySlug({
      "naruto/en-ccg::display-s24": entry({
        slug: "display-s24",
        kind: "display",
        behavior: "random_pack",
        name: "EN legacy",
        image: null,
      }),
      "naruto/carddass::display-s24": entry({
        slug: "display-s24",
        kind: "display",
        behavior: "random_pack",
        name: "Carddass",
        image: "/face.webp",
      }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "display-s24",
      name: "Carddass",
      image: "/face.webp",
    });
  });
});

describe("sealedProductsLoad projections", () => {
  it("keeps guaranteed prints on BuyProduct and exposes pool fields for containment", () => {
    const row = entry({
      slug: "starter",
      name: "Starter",
      kind: "deck",
      behavior: "known_bundle",
      setCode: "s1",
      image: "/art.webp",
      guaranteedPrints: [
        {
          name: "A",
          slug: "a",
          ref: null,
          printKey: "naruto:ni-0001",
        },
      ],
      randomPoolScope: "none",
    });

    expect(toBuyProduct(row)).toMatchObject({
      prints: ["naruto:ni-0001"],
      printsArePreview: false,
      setId: "s1",
    });
    expect(toContainmentProduct(row)).toMatchObject({
      guaranteedPrints: ["naruto:ni-0001"],
      randomPoolScope: "none",
      randomPoolPrints: [],
      setId: "s1",
      imageUrl: "/art.webp",
      language: null,
    });
  });

  it("passes language through to containment", () => {
    const row = entry({
      slug: "starter-en",
      kind: "deck",
      behavior: "known_bundle",
      lang: "EN",
      guaranteedPrints: [],
    });
    // Entry already normalized by load path; here lang is raw on SealedProductEntry.
    expect(toContainmentProduct({ ...row, lang: "en" })).toMatchObject({
      language: "en",
    });
  });

  it("projects listed pool keys onto containment products", () => {
    const row = entry({
      slug: "judge",
      kind: "booster",
      behavior: "random_pack",
      randomPoolScope: "listed",
      randomPoolPrints: [
        {
          name: "Promo",
          slug: "p",
          ref: null,
          printKey: "lorcana:1-p1",
        },
      ],
    });
    expect(toContainmentProduct(row).randomPoolPrints).toEqual([
      "lorcana:1-p1",
    ]);
    expect(toBuyProduct(row)).toMatchObject({
      randomPoolScope: "listed",
      randomPoolPrints: ["lorcana:1-p1"],
      printsArePreview: false,
    });
  });

  it("forwards packsBySet onto buy and containment projections", () => {
    const row = entry({
      slug: "tin-box",
      kind: "coffret",
      behavior: "mixed_bundle",
      packsBySet: { s1: 1, s2: 1 },
      packsContained: 2,
      cardsPerPack: 8,
    });
    expect(toBuyProduct(row).packsBySet).toEqual({ s1: 1, s2: 1 });
    expect(toContainmentProduct(row).packsBySet).toEqual({ s1: 1, s2: 1 });
  });
});
