import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadSealedProductsIndex,
  persistSealedProductsIndex,
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

      const { file } = persistSealedProductsIndex("lorcana", {
        "lorcana::starter": entry({ slug: "starter" }),
      });
      const onDisk = JSON.parse(readFileSync(file, "utf8")) as {
        products: Record<string, SealedProductEntry>;
      };
      expect(onDisk.products["lorcana::starter"]?.contentsKnown).toBe(true);
      expect(
        onDisk.products["lorcana::starter"]?.guaranteedPrints?.[0]?.printKey,
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

      const { file } = persistSealedProductsIndex("naruto/carddass", {
        "naruto/carddass::booster-s24": entry({
          slug: "booster-s24",
          kind: "booster",
          behavior: "random_pack",
          category: "boosters",
          image: null,
          lang: "fr",
        }),
      });
      const onDisk = JSON.parse(readFileSync(file, "utf8")) as {
        products: Record<string, SealedProductEntry>;
      };
      expect(onDisk.products["naruto/carddass::booster-s24"]?.image).toBe(
        "/assets/naruto/carddass/products/booster-s24/fr/art.toywiz.jpg",
      );
    });
  });
});
