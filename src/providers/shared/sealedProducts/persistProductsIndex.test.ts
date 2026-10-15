import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  coalesceSealedProductEntry,
  loadSealedProductsIndex,
  persistSealedProductsIndex,
  unionSealedProductsPreferPrimary,
} from "./persistProductsIndex";
import type { SealedProductEntry } from "./indexFormat";

const PREV = process.env.PLACARR_DATA_DIR;

function withDataRoot(root: string, run: () => void) {
  process.env.PLACARR_DATA_DIR = root;
  try {
    run();
  } finally {
    if (PREV === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = PREV;
  }
}

function entry(partial: Partial<SealedProductEntry> & { slug: string }): SealedProductEntry {
  return {
    path: "",
    kind: "deck",
    behavior: "known_bundle",
    category: "decks",
    name: partial.name ?? partial.slug,
    image: null,
    imageBack: null,
    setLogo: null,
    setCode: null,
    lang: "fr",
    releaseDate: null,
    priceCents: null,
    cardsPerPack: null,
    packsContained: null,
    guaranteedPrints: [],
    randomPoolScope: "none",
    randomPoolPrints: [],
    declaredCardCount: null,
    setCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: false,
    prints: [],
    ...partial,
  };
}

describe("persistSealedProductsIndex", () => {
  it("merges curated before write so load sees contentsKnown", () => {
    const root = mkdtempSync(path.join(tmpdir(), "placarr-persist-"));
    withDataRoot(root, () => {
      const curatedDir = path.join(root, "lorcana", "curated");
      mkdirSync(curatedDir, { recursive: true });
      writeFileSync(
        path.join(curatedDir, "products-contents.json"),
        `${JSON.stringify({
          version: 1,
          pack: "lorcana",
          updatedAt: "2026-09-09",
          skus: {
            starter: {
              source: "test",
              verifiedAt: "2026-09-09",
              contentsKnown: true,
              guaranteedPrintKeys: ["lorcana:1-1"],
            },
          },
        })}\n`,
      );

      const { index } = persistSealedProductsIndex("lorcana", {
        "lorcana::starter": entry({ slug: "starter" }),
      });
      expect(index.products["lorcana::starter"]?.contentsKnown).toBe(true);
      expect(
        index.products["lorcana::starter"]?.guaranteedPrints?.[0]?.printKey,
      ).toBe("lorcana:1-1");

      const loaded = loadSealedProductsIndex("lorcana");
      expect(loaded.products["lorcana::starter"]?.contentsKnown).toBe(true);
    });
  });

  it("backfills null image from disk art on load and persist", () => {
    const root = mkdtempSync(path.join(tmpdir(), "placarr-persist-art-"));
    withDataRoot(root, () => {
      const artDir = path.join(
        root,
        "naruto",
        "carddass",
        "products",
        "booster-s24",
        "fr",
      );
      mkdirSync(artDir, { recursive: true });
      writeFileSync(path.join(artDir, "art.toywiz.jpg"), "jpg");
      const packDir = path.join(root, "naruto", "carddass");
      mkdirSync(packDir, { recursive: true });
      writeFileSync(
        path.join(packDir, "products-index.json"),
        `${JSON.stringify({
          version: 1,
          pack: "naruto/carddass",
          generatedAt: "2026-09-09T00:00:00.000Z",
          products: {
            "naruto/carddass::booster-s24": entry({
              slug: "booster-s24",
              kind: "booster",
              behavior: "random_pack",
              category: "boosters",
              image: null,
              lang: "fr",
            }),
          },
        })}\n`,
      );

      const loaded = loadSealedProductsIndex("naruto/carddass");
      expect(loaded.products["naruto/carddass::booster-s24"]?.image).toBe(
        "/assets/naruto/carddass/products/booster-s24/fr/art.toywiz.jpg",
      );

      const { index } = persistSealedProductsIndex("naruto/carddass", {
        "naruto/carddass::booster-s24": entry({
          slug: "booster-s24",
          kind: "booster",
          behavior: "random_pack",
          category: "boosters",
          image: null,
          lang: "fr",
        }),
      });
      expect(index.products["naruto/carddass::booster-s24"]?.image).toBe(
        "/assets/naruto/carddass/products/booster-s24/fr/art.toywiz.jpg",
      );
      const reloaded = loadSealedProductsIndex("naruto/carddass");
      expect(reloaded.products["naruto/carddass::booster-s24"]?.image).toBe(
        "/assets/naruto/carddass/products/booster-s24/fr/art.toywiz.jpg",
      );
    });
  });

  it("fills SKUs present in products-index.json but missing from sqlite", () => {
    const root = mkdtempSync(path.join(tmpdir(), "placarr-sealed-gap-"));
    withDataRoot(root, () => {
      const packDir = path.join(root, "naruto", "carddass");
      mkdirSync(packDir, { recursive: true });

      persistSealedProductsIndex("naruto/carddass", {
        "naruto/carddass::pack-decouverte": entry({
          slug: "pack-decouverte",
          setCode: "s1",
        }),
      });

      writeFileSync(
        path.join(packDir, "products-index.json"),
        `${JSON.stringify({
          version: 1,
          pack: "naruto/carddass",
          generatedAt: "2026-10-08T00:00:00.000Z",
          products: {
            "naruto/carddass::pack-decouverte": entry({
              slug: "pack-decouverte",
              setCode: "s1",
              name: "Pack Découverte (stale json name)",
            }),
            "naruto/carddass::starter-pays-du-vent": entry({
              slug: "starter-pays-du-vent",
              setCode: "s1",
              name: "Pays du Vent",
              guaranteedPrints: [
                {
                  name: "NI-0001",
                  slug: "ni-0001",
                  ref: null,
                  printKey: "naruto:ni-0001",
                },
              ],
              contentsKnown: true,
            }),
          },
        })}\n`,
      );

      const loaded = loadSealedProductsIndex("naruto/carddass");
      expect(loaded.products["naruto/carddass::starter-pays-du-vent"]?.name).toBe(
        "Pays du Vent",
      );
      // Sqlite row wins when both exist — do not clobber with JSON.
      expect(loaded.products["naruto/carddass::pack-decouverte"]?.name).not.toBe(
        "Pack Découverte (stale json name)",
      );
    });
  });

  it("coalesces null identity fields from JSON onto curated sqlite stubs", () => {
    const stub = entry({
      slug: "starter-maitre-hokage",
      name: null,
      lang: null,
      image: null,
      contentsKnown: true,
      guaranteedPrints: [
        {
          name: "naruto:s1-ni0002",
          slug: "naruto:s1-ni0002",
          ref: null,
          printKey: "naruto:s1-ni0002",
        },
      ],
    });
    const boutique = entry({
      slug: "starter-maitre-hokage",
      name: "Starter Maître Hokage",
      lang: "FR",
      image: "/assets/naruto/carddass/products/starter-maitre-hokage/fr/art.jpg",
      contentsKnown: false,
      guaranteedPrints: [],
    });
    expect(coalesceSealedProductEntry(stub, boutique)).toMatchObject({
      name: "Starter Maître Hokage",
      lang: "FR",
      image: "/assets/naruto/carddass/products/starter-maitre-hokage/fr/art.jpg",
      contentsKnown: true,
      guaranteedPrints: stub.guaranteedPrints,
    });

    const root = mkdtempSync(path.join(tmpdir(), "placarr-sealed-stub-"));
    withDataRoot(root, () => {
      const packDir = path.join(root, "naruto", "carddass");
      mkdirSync(packDir, { recursive: true });

      persistSealedProductsIndex("naruto/carddass", {
        "naruto/carddass::starter-maitre-hokage": stub,
      });

      writeFileSync(
        path.join(packDir, "products-index.json"),
        `${JSON.stringify({
          version: 1,
          pack: "naruto/carddass",
          generatedAt: "2026-10-15T00:00:00.000Z",
          products: {
            "naruto/carddass::starter-maitre-hokage": boutique,
          },
        })}\n`,
      );

      const loaded = loadSealedProductsIndex("naruto/carddass");
      const row = loaded.products["naruto/carddass::starter-maitre-hokage"];
      expect(row?.name).toBe("Starter Maître Hokage");
      expect(row?.lang).toBe("FR");
      expect(row?.image).toContain("starter-maitre-hokage");
      expect(row?.contentsKnown).toBe(true);
      expect(row?.guaranteedPrints).toHaveLength(1);
    });
  });

  it("unionSealedProductsPreferPrimary keeps populated primary fields", () => {
    const primary = {
      "pack::a": entry({ slug: "a", name: "Sqlite", lang: "fr" }),
    };
    const fill = {
      "pack::a": entry({ slug: "a", name: "Json stale", lang: "en" }),
      "pack::b": entry({ slug: "b", name: "Json only", lang: "fr" }),
    };
    const union = unionSealedProductsPreferPrimary(primary, fill);
    expect(union["pack::a"]?.name).toBe("Sqlite");
    expect(union["pack::a"]?.lang).toBe("fr");
    expect(union["pack::b"]?.name).toBe("Json only");
  });
});
