import { describe, expect, it } from "vitest";

import {
  sealedContainmentForPrint,
  type ContainmentProduct,
} from "./sealedContainment";

function product(
  over: Partial<ContainmentProduct> &
    Pick<ContainmentProduct, "slug" | "name" | "kind" | "behavior">,
): ContainmentProduct {
  return over;
}

describe("sealedContainmentForPrint", () => {
  it("indexes guaranteed, listed pool, and set pool with priority", () => {
    const products: ContainmentProduct[] = [
      product({
        slug: "starter",
        name: "Starter Aurora",
        kind: "deck",
        behavior: "known_bundle",
        guaranteedPrints: ["lorcana:1-1", "lorcana:1-2"],
        imageUrl: "/assets/lorcana/products/starter/art.webp",
      }),
      product({
        slug: "judge",
        name: "Judge pack",
        kind: "booster",
        behavior: "random_pack",
        randomPoolScope: "listed",
        randomPoolPrints: ["lorcana:1-1", "lorcana:1-99"],
        setId: "1",
      }),
      product({
        slug: "booster",
        name: "Booster set 1",
        kind: "booster",
        behavior: "random_pack",
        randomPoolScope: "set",
        setId: "1",
        imageUrl: "/assets/lorcana/products/booster/art.webp",
      }),
      product({
        slug: "display",
        name: "Display set 1",
        kind: "display",
        behavior: "pack_container",
        randomPoolScope: "set",
        setId: "1",
      }),
      product({
        slug: "other-set",
        name: "Booster set 2",
        kind: "booster",
        behavior: "random_pack",
        randomPoolScope: "set",
        setId: "2",
      }),
      product({
        slug: "preview",
        name: "Coffret preview",
        kind: "coffret",
        behavior: "mixed_bundle",
        guaranteedPrints: ["lorcana:1-1"],
        printsArePreview: true,
      }),
    ];

    const sources = sealedContainmentForPrint({
      printKey: "lorcana:1-1",
      setId: "1",
      products,
    });

    expect(sources.map((row) => row.slug)).toEqual([
      "starter",
      "judge",
      "booster",
      "display",
    ]);
    expect(sources[0]).toMatchObject({
      relation: "guaranteed",
      imageUrl: "/assets/lorcana/products/starter/art.webp",
    });
    expect(sources[1]?.relation).toBe("listed_pool");
    expect(sources[2]?.relation).toBe("set_pool");
    expect(sources[3]?.relation).toBe("set_pool");
  });

  it("prefers guaranteed when the same slug could also be set pool", () => {
    const sources = sealedContainmentForPrint({
      printKey: "x:1-a",
      setId: "1",
      products: [
        product({
          slug: "gift",
          name: "Gift",
          kind: "coffret",
          behavior: "mixed_bundle",
          setId: "1",
          guaranteedPrints: ["x:1-a"],
          randomPoolScope: "set",
        }),
      ],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.relation).toBe("guaranteed");
  });

  it("ignores no_cards and empty print keys", () => {
    expect(
      sealedContainmentForPrint({
        printKey: "",
        setId: "1",
        products: [
          product({
            slug: "sheet",
            name: "Sell sheet",
            kind: "ephemera",
            behavior: "no_cards",
            guaranteedPrints: ["x:1-a"],
          }),
        ],
      }),
    ).toEqual([]);
  });

  it("indexes mixed_bundle set_pool via packsBySet when setId is null", () => {
    const sources = sealedContainmentForPrint({
      printKey: "naruto:ni-0001",
      setId: "s1",
      products: [
        product({
          slug: "tin-box",
          name: "Coffret Métal",
          kind: "coffret",
          behavior: "mixed_bundle",
          setId: null,
          randomPoolScope: "set",
          packsBySet: { s1: 1, s2: 1 },
          guaranteedPrints: ["naruto:pr-0016"],
        }),
      ],
    });
    expect(sources).toEqual([
      expect.objectContaining({
        slug: "tin-box",
        relation: "set_pool",
      }),
    ]);
  });

  it("sorts decks before boosters within the same relation", () => {
    const sources = sealedContainmentForPrint({
      printKey: "x:s1-1",
      setId: "s1",
      products: [
        product({
          slug: "booster-s1",
          name: "Booster",
          kind: "booster",
          behavior: "random_pack",
          randomPoolScope: "set",
          setId: "s1",
        }),
        product({
          slug: "starter-a",
          name: "Starter A",
          kind: "deck",
          behavior: "known_bundle",
          guaranteedPrints: ["x:s1-1"],
        }),
        product({
          slug: "starter-b",
          name: "Starter B",
          kind: "deck",
          behavior: "known_bundle",
          guaranteedPrints: ["x:s1-1"],
        }),
      ],
    });
    expect(sources.map((row) => row.slug)).toEqual([
      "starter-a",
      "starter-b",
      "booster-s1",
    ]);
  });
});
