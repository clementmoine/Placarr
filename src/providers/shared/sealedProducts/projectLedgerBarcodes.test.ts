import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SealedProductEntry } from "./indexFormat";
import {
  applyLedgerBarcodesToProducts,
  attachBarcodesFromLedgerRows,
  mineSourceBarcodes,
  overlayMinedBarcodesOntoProducts,
  projectBarcodesFromJsonProducts,
} from "./projectLedgerBarcodes";

function entry(
  partial: Partial<SealedProductEntry> & { slug: string },
): SealedProductEntry {
  return {
    path: "",
    kind: "booster",
    behavior: "random_pack",
    category: "boosters",
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

describe("projectLedgerBarcodes", () => {
  it("applyLedgerBarcodesToProducts attaches by slug", () => {
    const products: Record<string, SealedProductEntry> = {
      "pack::duopack-s24": entry({ slug: "duopack-s24" }),
      "pack::other": entry({ slug: "other" }),
    };
    const applied = applyLedgerBarcodesToProducts(products, [
      {
        slug: "duopack-s24",
        barcodes: ["3391891963138"],
        source: "fnac",
      },
    ]);
    expect(applied).toBe(1);
    expect(products["pack::duopack-s24"]?.barcodes).toEqual(["3391891963138"]);
    expect(products["pack::duopack-s24"]?.barcodeSources).toEqual({
      "3391891963138": "fnac",
    });
    expect(products["pack::other"]?.barcodes).toBeUndefined();
  });

  it("attachBarcodesFromLedgerRows / projectBarcodesFromJsonProducts read ean+slug", () => {
    const products: Record<string, SealedProductEntry> = {
      "bleach/scb::booster-s1-shinigami-and-ichigo": entry({
        slug: "booster-s1-shinigami-and-ichigo",
      }),
      "bleach/scb::display-s1-shinigami-and-ichigo": entry({
        slug: "display-s1-shinigami-and-ichigo",
      }),
    };
    const applied = projectBarcodesFromJsonProducts(products, [
      {
        slug: "booster-s1-shinigami-and-ichigo",
        ean: "3296580052110",
        host: "tempslibre",
      },
      {
        slug: "display-s1-shinigami-and-ichigo",
        ean: "3296580052110",
        host: "ultrajeux",
      },
    ]);
    expect(applied).toBe(2);
    expect(
      products["bleach/scb::booster-s1-shinigami-and-ichigo"]?.barcodes,
    ).toEqual(["3296580052110"]);
    expect(
      products["bleach/scb::display-s1-shinigami-and-ichigo"]?.barcodes,
    ).toEqual(["3296580052110"]);
  });

  it("mineSourceBarcodes extracts slug+ean from nested JSON fixtures", () => {
    const root = mkdtempSync(path.join(tmpdir(), "placarr-mine-bc-"));
    const sources = path.join(root, "sources");
    mkdirSync(path.join(sources, "shops"), { recursive: true });
    writeFileSync(
      path.join(sources, "shops", "fnac.json"),
      `${JSON.stringify({
        products: [
          {
            slug: "duopack-s24",
            ean: "3391891963138",
            host: "fnac",
          },
          { slug: "no-code", title: "skip" },
          {
            slug: "starter-detruire-konoha",
            ean: "3296580051137",
            listing: "https://ultrajeux.example/776",
          },
        ],
      })}\n`,
    );
    writeFileSync(
      path.join(sources, "noise.json"),
      `${JSON.stringify({ note: "no products" })}\n`,
    );

    const mined = mineSourceBarcodes(root);
    expect(mined.size).toBe(2);
    expect(mined.get("duopack-s24")?.barcodes).toEqual(["3391891963138"]);
    expect(mined.get("duopack-s24")?.sources["3391891963138"]).toBe("fnac");
    expect(mined.get("starter-detruire-konoha")?.barcodes).toEqual([
      "3296580051137",
    ]);
  });

  it("Naruto: tmp packshot ledger densifies a known slug onto products", () => {
    const PREV = process.env.PLACARR_DATA_DIR;
    const root = mkdtempSync(path.join(tmpdir(), "placarr-naruto-bc-"));
    process.env.PLACARR_DATA_DIR = root;
    try {
      const sources = path.join(root, "naruto", "carddass", "sources");
      mkdirSync(sources, { recursive: true });
      writeFileSync(
        path.join(sources, "ultrajeux-sealed.json"),
        `${JSON.stringify({
          products: [
            {
              slug: "starter-detruire-konoha",
              ean: "3296580051137",
              host: "ultrajeux",
            },
          ],
        })}\n`,
      );

      const products: Record<string, SealedProductEntry> = {
        "naruto/carddass::starter-detruire-konoha": entry({
          slug: "starter-detruire-konoha",
          kind: "deck",
          category: "decks",
        }),
        "naruto/carddass::booster-s1": entry({ slug: "booster-s1" }),
      };
      const applied = overlayMinedBarcodesOntoProducts(
        products,
        "naruto/carddass",
      );
      expect(applied).toBe(1);
      expect(
        products["naruto/carddass::starter-detruire-konoha"]?.barcodes,
      ).toEqual(["3296580051137"]);
      expect(
        products["naruto/carddass::starter-detruire-konoha"]?.barcodeSources?.[
          "3296580051137"
        ],
      ).toBe("ultrajeux");
      expect(products["naruto/carddass::booster-s1"]?.barcodes).toBeUndefined();
    } finally {
      if (PREV === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = PREV;
    }
  });

  it("attachBarcodesFromLedgerRows accepts stem as slug alias (DBH)", () => {
    const products: Record<string, SealedProductEntry> = {
      "dragonball/heroes::extra-booster-pack-4": entry({
        slug: "extra-booster-pack-4",
      }),
    };
    const applied = attachBarcodesFromLedgerRows(products, "dragonball/heroes", [
      { stem: "extra-booster-pack-4", jan: "4570118213631" },
    ]);
    expect(applied).toBe(1);
    expect(
      products["dragonball/heroes::extra-booster-pack-4"]?.barcodes,
    ).toEqual(["4570118213631"]);
  });
});
