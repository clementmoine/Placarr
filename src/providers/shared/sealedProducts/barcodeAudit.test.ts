import { describe, expect, it } from "vitest";

import type { SealedProductEntry } from "./indexFormat";
import {
  auditSealedBarcodes,
  formatSealedBarcodeAuditReport,
} from "./barcodeAudit";
import type { MinedSlugBarcodes } from "./projectLedgerBarcodes";

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

describe("auditSealedBarcodes", () => {
  it("counts SKUs, barcodes, orphans, and zero-GTIN packs", () => {
    const productsByPack: Record<string, Record<string, SealedProductEntry>> = {
      lorcana: {
        "lorcana::woody": entry({ slug: "woody" }),
        "lorcana::merida": entry({ slug: "merida" }),
      },
      "naruto/carddass": {
        "naruto/carddass::duopack-s24": entry({
          slug: "duopack-s24",
          barcodes: ["3391891963138"],
        }),
        "naruto/carddass::booster-s1": entry({ slug: "booster-s1" }),
      },
    };
    const minedByPack: Record<string, Map<string, MinedSlugBarcodes>> = {
      lorcana: new Map(),
      "naruto/carddass": new Map([
        [
          "duopack-s24",
          {
            barcodes: ["3391891963138"],
            sources: { "3391891963138": "fnac" },
          },
        ],
        [
          "ghost-sku-from-dig",
          {
            barcodes: ["3296580052110"],
            sources: { "3296580052110": "hunt" },
          },
        ],
      ]),
    };
    const indexExists = new Set(["naruto/carddass"]);

    const report = auditSealedBarcodes({
      packIds: ["lorcana", "naruto/carddass"],
      loadProducts: (packId) => productsByPack[packId] ?? {},
      mineSources: (packId) => minedByPack[packId] ?? new Map(),
      productsIndexExists: (packId) => indexExists.has(packId),
    });

    expect(report.packsWithZeroGtins).toEqual(["lorcana"]);
    expect(report.packs).toEqual([
      expect.objectContaining({
        packId: "lorcana",
        skuCount: 2,
        skusWithBarcodes: 0,
        barcodeCount: 0,
        orphanSourceSlugs: [],
        orphanSourceBarcodes: [],
        productsIndexExists: false,
      }),
      expect.objectContaining({
        packId: "naruto/carddass",
        skuCount: 2,
        skusWithBarcodes: 1,
        barcodeCount: 1,
        orphanSourceSlugs: ["ghost-sku-from-dig"],
        orphanSourceBarcodes: ["3296580052110"],
        productsIndexExists: true,
      }),
    ]);
    expect(report.totals).toEqual({
      skuCount: 4,
      skusWithBarcodes: 1,
      barcodeCount: 1,
      orphanSourceSlugCount: 1,
      orphanSourceBarcodeCount: 1,
    });

    const text = formatSealedBarcodeAuditReport(report);
    expect(text).toContain("zeroGtinPacks (1): lorcana");
    expect(text).toContain("naruto/carddass: skus=2 withGtin=1");
    expect(text).toContain("orphans=1(1 codes)");
  });
});
