import { describe, expect, it } from "vitest";

import { buildCatalogueSealedRows } from "./catalogueProducts";
import type { ProductsIndexV1 } from "@/providers/shared/sealedProducts/indexFormat";

describe("catalogue sealed rows", () => {
  it("labels a preview booster without claiming known contents", () => {
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "lorcana",
      generatedAt: "2026-08-16T00:00:00.000Z",
      products: {
        "lorcana::woody": {
          slug: "woody",
          path: "/products/boosters/woody",
          kind: "booster",
          behavior: "random_pack",
          category: "boosters",
          name: "Booster Woody",
          image: "https://example.test/woody.webp",
          imageBack: null,
          setCardCount: null,
          setLogo: null,
          setCode: "WIL",
          lang: "FR",
          releaseDate: null,
          declaredCardCount: 446,
          contentsKnown: false,
          containsPrintsIsPreview: true,
          prints: [
            { name: "Jessie", slug: "jessie", ref: null, printKey: null },
          ],
        },
      },
    };
    const rows = buildCatalogueSealedRows("lorcana", index);
    expect(rows).toEqual([
      expect.objectContaining({
        productKey: "lorcana::woody",
        kind: "booster",
        contentsKnown: false,
        printCount: 1,
        declaredCardCount: 446,
        label: "WIL · Booster Woody · 1/446",
      }),
    ]);
  });

  it("lists FR boosters and EN displays in the same Carddass catalogue", () => {
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-08-16T00:00:00.000Z",
      products: {
        "naruto/carddass::booster-s1": {
          slug: "booster-s1",
          path: "staging/vialudibunda/x.jpg",
          kind: "booster",
          behavior: "random_pack",
          category: "boosters",
          name: "Booster Série 1",
          image: "/assets/naruto/carddass/products/booster-s1.jpg",
          imageBack: null,
          setCardCount: null,
          setLogo: null,
          setCode: "s1",
          lang: "FR",
          releaseDate: null,
          declaredCardCount: 8,
          contentsKnown: false,
          containsPrintsIsPreview: false,
          prints: [],
        },
        "naruto/carddass::display-s28": {
          slug: "display-s28",
          path: "staging/coleka-s28/set-cover.webp",
          kind: "display",
          behavior: "pack_container",
          category: "displays",
          name: "Display Storm 3",
          image: "/assets/naruto/carddass/products/display-s28.webp",
          imageBack: null,
          setCardCount: null,
          setLogo: null,
          setCode: "s28",
          lang: "EN",
          releaseDate: null,
          declaredCardCount: null,
          contentsKnown: false,
          containsPrintsIsPreview: false,
          prints: [],
        },
      },
    };
    const rows = buildCatalogueSealedRows("naruto/carddass", index);
    expect(rows.map((row) => row.slug)).toEqual(["booster-s1", "display-s28"]);
  });
});
