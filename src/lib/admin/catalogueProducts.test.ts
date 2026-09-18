import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCatalogueSealedRows,
  getCatalogueProductDetail,
  getCatalogueProductDetailAsync,
  resetCatalogueProductsCache,
  resolveSealedSetLotteryPool,
} from "./catalogueProducts";
import type { ProductsIndexV1 } from "@/providers/shared/sealedProducts/indexFormat";

vi.mock("@/providers/shared/packOwner", () => ({
  providerModuleForPack: vi.fn(() => ({
    listSetPrints: ({ setId }: { setId: string }) =>
      setId === "s5"
        ? [
            {
              printKey: "naruto:ta-0214",
              title: "Exemple S5",
              reference: "TA-214",
            },
            {
              printKey: "naruto:ni-0200",
              title: "Autre S5",
              reference: "NI-200",
            },
          ]
        : setId === "s1"
          ? [
              {
                printKey: "naruto:ni-0047",
                title: "Sasuke Uchiwa",
                reference: "NI-047",
              },
              {
                printKey: "naruto:ni-0047-prerelease",
                title: "Sasuke Uchiwa",
                reference: "NI-047 · prerelease",
              },
              {
                printKey: "naruto:ni-0019-prerelease",
                title: "Prerelease only",
                reference: "NI-019 · prerelease",
              },
            ]
          : [],
  })),
}));

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
  resetCatalogueProductsCache();
});

function baseEntry(
  overrides: Partial<ProductsIndexV1["products"][string]> & {
    slug: string;
    kind: ProductsIndexV1["products"][string]["kind"];
    behavior: ProductsIndexV1["products"][string]["behavior"];
  },
): ProductsIndexV1["products"][string] {
  return {
    path: `/products/${overrides.slug}`,
    category: "test",
    name: overrides.name ?? overrides.slug,
    image: null,
    imageBack: null,
    setCardCount: null,
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
    contentsKnown: false,
    containsPrintsIsPreview: false,
    prints: [],
    ...overrides,
  };
}

describe("catalogue sealed rows", () => {
  it("labels a preview booster without claiming known contents", () => {
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "lorcana",
      generatedAt: "2026-08-16T00:00:00.000Z",
      products: {
        "lorcana::woody": baseEntry({
          slug: "woody",
          kind: "booster",
          behavior: "random_pack",
          category: "boosters",
          name: "Booster Woody",
          image: "https://example.test/woody.webp",
          setCode: "WIL",
          declaredCardCount: 446,
          containsPrintsIsPreview: true,
          prints: [
            { name: "Jessie", slug: "jessie", ref: null, printKey: null },
          ],
        }),
      },
    };
    const rows = buildCatalogueSealedRows("lorcana", index);
    expect(rows).toEqual([
      expect.objectContaining({
        productKey: "lorcana::woody",
        kind: "booster",
        lang: "fr",
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
        "naruto/carddass::booster-s1": baseEntry({
          slug: "booster-s1",
          kind: "booster",
          behavior: "random_pack",
          category: "boosters",
          name: "Booster Série 1",
          image: "/assets/naruto/carddass/products/booster-s1.jpg",
          setCode: "s1",
          declaredCardCount: 8,
        }),
        "naruto/carddass::display-s28": baseEntry({
          slug: "display-s28",
          kind: "display",
          behavior: "pack_container",
          category: "displays",
          name: "Display Storm 3",
          image: "/assets/naruto/carddass/products/display-s28.webp",
          setCode: "s28",
          lang: "EN",
        }),
      },
    };
    const rows = buildCatalogueSealedRows("naruto/carddass", index);
    expect(rows.map((row) => row.slug)).toEqual(["booster-s1", "display-s28"]);
    expect(rows.map((row) => row.lang)).toEqual(["fr", "en"]);
  });

  it("keeps contentsKnown so the unknown-contents checklist can filter", () => {
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "lorcana",
      generatedAt: "2026-08-16T00:00:00.000Z",
      products: {
        "lorcana::starter": baseEntry({
          slug: "starter",
          kind: "deck",
          behavior: "known_bundle",
          category: "decks",
          name: "Starter",
          setCode: "FC",
          contentsKnown: true,
          packsContained: 1,
          randomPoolScope: "none",
          declaredCardCount: 60,
          guaranteedPrints: [
            {
              name: "Mickey",
              slug: "mickey",
              ref: "1-1",
              printKey: "lorcana:1-1",
              qty: 2,
            },
            {
              name: "Goofy",
              slug: "goofy",
              ref: "1-2",
              printKey: "lorcana:1-2",
              qty: 3,
            },
          ],
          prints: [
            {
              name: "Mickey",
              slug: "mickey",
              ref: "1-1",
              printKey: "lorcana:1-1",
              qty: 2,
            },
          ],
        }),
        "lorcana::mystery": baseEntry({
          slug: "mystery",
          kind: "collector_box",
          behavior: "mixed_bundle",
          category: "boxes",
          name: "Mystery",
          contentsKnown: false,
        }),
      },
    };
    const rows = buildCatalogueSealedRows("lorcana", index);
    expect(rows.filter((row) => row.contentsKnown).map((r) => r.slug)).toEqual([
      "starter",
    ]);
    expect(rows.filter((row) => !row.contentsKnown).map((r) => r.slug)).toEqual([
      "mystery",
    ]);
    // Qty sum of guarantees (2+3), not shop `prints.length`.
    expect(rows.find((r) => r.slug === "starter")?.printCount).toBe(5);
  });

  it("counts curated guarantees even when contentsKnown is still false", () => {
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-09-09T00:00:00.000Z",
      products: {
        "naruto/carddass::tin-box": baseEntry({
          slug: "tin-box",
          kind: "tin",
          behavior: "mixed_bundle",
          category: "collector-boxes",
          name: "Coffret Métal",
          contentsKnown: false,
          declaredCardCount: 57,
          packsContained: 2,
          guaranteedPrints: [
            {
              name: "promo",
              slug: "promo",
              ref: null,
              printKey: "naruto:pr-0016",
              qty: 1,
            },
            {
              name: "deck-card",
              slug: "deck-card",
              ref: null,
              printKey: "naruto:ni-0156",
              qty: 2,
            },
          ],
        }),
      },
    };
    const row = buildCatalogueSealedRows("naruto/carddass", index)[0]!;
    expect(row.printCount).toBe(3);
    expect(row.contentsKnown).toBe(false);
    expect(row.label).toContain("3/57");
  });

  it("resolves guaranteedProducts packshots for the sealed detail dialog", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "cat-sealed-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const packDir = path.join(root, "naruto", "carddass");
    mkdirSync(packDir, { recursive: true });
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-09-09T00:00:00.000Z",
      products: {
        "naruto/carddass::booster-s1": baseEntry({
          slug: "booster-s1",
          kind: "booster",
          behavior: "random_pack",
          name: "Booster Série 1",
          image: "/assets/naruto/carddass/products/booster-s1/fr/art.webp",
          setCode: "s1",
        }),
        "naruto/carddass::starter-pays-du-vent": baseEntry({
          slug: "starter-pays-du-vent",
          kind: "deck",
          behavior: "known_bundle",
          name: "Starter Pays du Vent",
          image: "/assets/naruto/carddass/products/starter-pays-du-vent/fr/art.webp",
          contentsKnown: true,
        }),
        "naruto/carddass::pack-decouverte": baseEntry({
          slug: "pack-decouverte",
          kind: "deck_bundle",
          behavior: "mixed_bundle",
          name: "Pack Découverte",
          contentsKnown: true,
          declaredCardCount: 96,
          guaranteedProducts: [
            { slug: "starter-pays-du-vent", qty: 1 },
            { slug: "booster-s1", qty: 2 },
          ],
        }),
      },
    };
    writeFileSync(
      path.join(packDir, "products-index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    resetCatalogueProductsCache();
    const detail = getCatalogueProductDetail(
      "naruto/carddass",
      "naruto/carddass::pack-decouverte",
    );
    expect(detail?.guaranteedProducts).toEqual([
      expect.objectContaining({
        slug: "starter-pays-du-vent",
        qty: 1,
        name: "Starter Pays du Vent",
        image: "/assets/naruto/carddass/products/starter-pays-du-vent/fr/art.webp",
        contentsKnown: true,
      }),
      expect.objectContaining({
        slug: "booster-s1",
        qty: 2,
        name: "Booster Série 1",
        image: "/assets/naruto/carddass/products/booster-s1/fr/art.webp",
      }),
    ]);
  });

  it("prefers face.json packshots for contained products", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "cat-sealed-face-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const packDir = path.join(root, "naruto", "carddass");
    const artDir = path.join(packDir, "products", "booster-s1", "fr");
    mkdirSync(artDir, { recursive: true });
    writeFileSync(path.join(artDir, "art.vialudibunda.jpg"), "jpg");
    writeFileSync(
      path.join(artDir, "face.json"),
      `${JSON.stringify({ art: "art.vialudibunda.jpg" }, null, 2)}\n`,
    );
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-09-09T00:00:00.000Z",
      products: {
        "naruto/carddass::booster-s1": baseEntry({
          slug: "booster-s1",
          kind: "booster",
          behavior: "random_pack",
          name: "Booster Série 1",
          image: "/assets/naruto/carddass/products/booster-s1/fr/art.carddass.gif",
          setCode: "s1",
        }),
        "naruto/carddass::tin-box": baseEntry({
          slug: "tin-box",
          kind: "tin",
          behavior: "mixed_bundle",
          name: "Coffret Métal",
          contentsKnown: true,
          guaranteedProducts: [{ slug: "booster-s1", qty: 1 }],
        }),
      },
    };
    writeFileSync(
      path.join(packDir, "products-index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    resetCatalogueProductsCache();
    const detail = getCatalogueProductDetail(
      "naruto/carddass",
      "naruto/carddass::tin-box",
    );
    expect(detail?.guaranteedProducts?.[0]?.image).toBe(
      "/assets/naruto/carddass/products/booster-s1/fr/art.vialudibunda.jpg",
    );
  });

  it("expands set lottery into randomPoolPrints for the detail dialog", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "cat-sealed-set-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const packDir = path.join(root, "naruto", "carddass");
    mkdirSync(packDir, { recursive: true });
    const index: ProductsIndexV1 = {
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-09-09T00:00:00.000Z",
      products: {
        "naruto/carddass::kana-dvd-naruto-vol3": baseEntry({
          slug: "kana-dvd-naruto-vol3",
          kind: "special",
          behavior: "random_pack",
          name: "Naruto DVD Edited — Vol. 3 (Kana)",
          setCode: "s5",
          lang: "fr",
          contentsKnown: true,
          cardsPerPack: 1,
          packsContained: 1,
          declaredCardCount: 1,
          randomPoolScope: "set",
          randomPoolPrints: [],
        }),
      },
    };
    writeFileSync(
      path.join(packDir, "products-index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    resetCatalogueProductsCache();
    const pool = await resolveSealedSetLotteryPool({
      packId: "naruto/carddass",
      setCode: "s5",
      lang: "fr",
      scope: "set",
      existing: [],
    });
    expect(pool).toEqual([
      expect.objectContaining({ printKey: "naruto:ta-0214" }),
      expect.objectContaining({ printKey: "naruto:ni-0200" }),
    ]);
    const detail = await getCatalogueProductDetailAsync(
      "naruto/carddass",
      "naruto/carddass::kana-dvd-naruto-vol3",
    );
    expect(detail?.randomPoolPrints).toHaveLength(2);
    expect(detail?.randomPoolPrints[0]?.printKey).toBe("naruto:ta-0214");
  });

  it("excludes printKey groupings (prerelease) from set lottery pools", async () => {
    const pool = await resolveSealedSetLotteryPool({
      packId: "naruto/carddass",
      setCode: "s1",
      lang: "fr",
      scope: "set",
      existing: [],
    });
    expect(pool.map((row) => row.printKey)).toEqual(["naruto:ni-0047"]);
  });
});
