import { describe, expect, it } from "vitest";

import type { ProductsIndexV1 } from "./indexFormat";
import { rewriteSealedProductsIndex } from "./rewrite";

describe("rewriteSealedProductsIndex", () => {
  it("promotes coffret categories and normalizes langs without changing slugs", () => {
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "pokemon",
      generatedAt: "2026-01-01T00:00:00.000Z",
      products: {
        "pokemon::etb-demo": {
          slug: "coffret-dresseur-elite-demo",
          path: "/products/elite-trainer/x",
          kind: "coffret",
          behavior: "mixed_bundle",
          category: "elite-trainer",
          name: "ETB Demo",
          image: null,
          imageBack: null,
          setLogo: null,
          setCode: null,
          lang: "FR",
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
        },
        "pokemon::blister-carton": {
          slug: "booster-blister-carton-sv01",
          path: "/products/boosters/x",
          kind: "booster",
          behavior: "random_pack",
          category: "boosters",
          name: "Booster Blister Carton SV01",
          image: null,
          imageBack: null,
          setLogo: null,
          setCode: null,
          lang: null,
          releaseDate: null,
          priceCents: null,
          cardsPerPack: null,
          packsContained: 1,
          guaranteedPrints: [],
          randomPoolScope: "unknown",
          randomPoolPrints: [],
          declaredCardCount: null,
          setCardCount: null,
          contentsKnown: false,
          containsPrintsIsPreview: false,
          prints: [],
        },
        "onepiece::jp-display": {
          slug: "japanese-display-op01",
          path: "/products/displays/x",
          kind: "display",
          behavior: "pack_container",
          category: "displays",
          name: "Japanese Display OP01",
          image: null,
          imageBack: null,
          setLogo: null,
          setCode: null,
          lang: "jp",
          releaseDate: null,
          priceCents: null,
          cardsPerPack: null,
          packsContained: 24,
          guaranteedPrints: [],
          randomPoolScope: "unknown",
          randomPoolPrints: [],
          declaredCardCount: null,
          setCardCount: null,
          contentsKnown: false,
          containsPrintsIsPreview: false,
          prints: [],
        },
      },
    };

    const { index: next, changed } = rewriteSealedProductsIndex(index);
    expect(changed).toBeGreaterThanOrEqual(3);
    expect(next.products["pokemon::etb-demo"]?.kind).toBe("etb");
    expect(next.products["pokemon::etb-demo"]?.lang).toBe("fr");
    expect(next.products["pokemon::blister-carton"]?.kind).toBe("blister_case");
    expect(next.products["onepiece::jp-display"]?.lang).toBe("ja");
    expect(next.products["onepiece::jp-display"]?.slug).toBe(
      "japanese-display-op01",
    );
  });
});
