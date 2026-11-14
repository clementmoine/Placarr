import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { emptyProductsIndex, type SealedProductEntry } from "@/providers/shared/sealedProducts/indexFormat";
import { writeProductsIndexToSqlite } from "@/providers/shared/sealedProducts/productsSqlite";
import { resolveSealedSkuByBarcode } from "@/core/identify/resolveSealedSkuByBarcode";

function minimalEntry(
  slug: string,
  overrides: Partial<SealedProductEntry> = {},
): SealedProductEntry {
  return {
    slug,
    path: `products/${slug}`,
    kind: "booster",
    behavior: "random_pack",
    category: "booster",
    name: slug,
    image: null,
    imageBack: null,
    setLogo: null,
    setCode: "s1",
    lang: "fr",
    releaseDate: null,
    priceCents: 100,
    cardsPerPack: 5,
    packsContained: 1,
    guaranteedPrints: [],
    randomPoolScope: "set",
    randomPoolPrints: [],
    declaredCardCount: null,
    setCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: false,
    prints: [],
    ...overrides,
  };
}

describe("resolveSealedSkuByBarcode", () => {
  let dir = "";

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when no sealed catalogue hit", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "placarr-sku-empty-"));
    const dbPath = path.join(dir, "catalog.sqlite");
    writeProductsIndexToSqlite("empty-pack", emptyProductsIndex("empty-pack"), {
      dbPath,
    });
    expect(
      resolveSealedSkuByBarcode("9780000000000", {
        packIds: ["empty-pack"],
        dbPathForPack: () => dbPath,
      }),
    ).toBeNull();
  });

  it("returns sure for a unique GTIN", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "placarr-sku-one-"));
    const dbPath = path.join(dir, "catalog.sqlite");
    // Valid EAN-13 (GS1 check digit).
    const ean = "4006381333931";
    const index = emptyProductsIndex("naruto/carddass");
    index.products["naruto/carddass::booster-s1"] = minimalEntry("booster-s1", {
      barcodes: [ean],
    });
    writeProductsIndexToSqlite("naruto/carddass", index, { dbPath });

    expect(
      resolveSealedSkuByBarcode(ean, {
        packIds: ["naruto/carddass"],
        dbPathForPack: () => dbPath,
      }),
    ).toEqual({
      confidence: "sure",
      productKey: "naruto/carddass::booster-s1",
      packId: "naruto/carddass",
    });
  });

  it("returns doubt on multi-SKU collision (Bleach trap)", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "placarr-sku-bleach-"));
    const dbPath = path.join(dir, "catalog.sqlite");
    const shared = "3296580052110";
    const index = emptyProductsIndex("bleach/scb");
    index.products["bleach/scb::booster-s1"] = minimalEntry("booster-s1", {
      barcodes: [shared],
    });
    index.products["bleach/scb::display-s1"] = minimalEntry("display-s1", {
      kind: "display",
      category: "display",
      behavior: "pack_container",
      packsContained: 24,
      barcodes: [shared],
    });
    writeProductsIndexToSqlite("bleach/scb", index, { dbPath });

    const resolved = resolveSealedSkuByBarcode(shared, {
      packIds: ["bleach/scb"],
      dbPathForPack: () => dbPath,
    });
    expect(resolved?.confidence).toBe("doubt");
    if (resolved?.confidence !== "doubt") return;
    expect(resolved.hits.map((h) => h.productKey).sort()).toEqual([
      "bleach/scb::booster-s1",
      "bleach/scb::display-s1",
    ]);
  });
});
