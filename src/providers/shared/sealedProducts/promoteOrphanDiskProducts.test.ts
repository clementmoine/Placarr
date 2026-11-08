import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyProductsIndex } from "./indexFormat";
import {
  inferSealedKindFromProductSlug,
  isNumberedSealedProductDumpSlug,
  promoteOrphanSealedProductsFromDisk,
  sealedSlugKindStem,
} from "./promoteOrphanDiskProducts";

let root = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "orphan-disk-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("inferSealedKindFromProductSlug", () => {
  it.each([
    ["into-the-inklands-booster", "booster"],
    ["into-the-inklands-booster-en", "booster"],
    ["into-the-inklands-booster-2", "booster"],
    ["elsa-gift-box-collector_box", "collector_box"],
    ["attack-of-the-vine-display-de", "display"],
  ] as const)("%s → %s", (slug, kind) => {
    expect(inferSealedKindFromProductSlug(slug)).toBe(kind);
  });

  it("returns null for unknown stems", () => {
    expect(inferSealedKindFromProductSlug("random-folder")).toBeNull();
  });
});

describe("isNumberedSealedProductDumpSlug", () => {
  it("flags collision dumps with a kind stem", () => {
    expect(isNumberedSealedProductDumpSlug("into-the-inklands-booster-2")).toBe(
      true,
    );
    expect(isNumberedSealedProductDumpSlug("into-the-inklands-booster")).toBe(
      false,
    );
  });

  it("ignores chapter-looking slugs without a kind", () => {
    expect(isNumberedSealedProductDumpSlug("set-3")).toBe(false);
  });
});

describe("sealedSlugKindStem", () => {
  it("strips locale and numbered dump suffixes", () => {
    expect(sealedSlugKindStem("into-the-inklands-booster-en")).toBe(
      "into-the-inklands-booster",
    );
    expect(sealedSlugKindStem("into-the-inklands-booster-3")).toBe(
      "into-the-inklands-booster",
    );
  });
});

describe("promoteOrphanSealedProductsFromDisk", () => {
  it("mints a missing SKU from products/{slug}/{lang}/art.*", () => {
    const productsDir = path.join(root, "products");
    const artDir = path.join(productsDir, "into-the-inklands-booster", "fr");
    mkdirSync(artDir, { recursive: true });
    writeFileSync(path.join(artDir, "art.disneysite.png"), "png");

    const index = emptyProductsIndex("lorcana");
    const out = promoteOrphanSealedProductsFromDisk({
      packId: "lorcana",
      index,
      productsDir,
      category: "official-site",
      resolveName: () => "Les Terres d'Encres booster",
      resolveCatalogueSetId: () => "3",
      resolveSetCode: () => "3",
    });

    expect(out.written).toBe(1);
    expect(out.keys).toEqual(["lorcana::into-the-inklands-booster"]);
    const row = index.products["lorcana::into-the-inklands-booster"];
    expect(row).toMatchObject({
      slug: "into-the-inklands-booster",
      lang: "fr",
      kind: "booster",
      behavior: "random_pack",
      category: "official-site",
      name: "Les Terres d'Encres booster",
      catalogueSetId: "3",
      image: "/assets/lorcana/products/into-the-inklands-booster/fr/face",
    });
    expect(existsSync(path.join(artDir, "art.disneysite.png"))).toBe(true);
  });

  it("skips numbered dumps when the canonical slug folder exists", () => {
    const productsDir = path.join(root, "products");
    for (const slug of [
      "into-the-inklands-booster",
      "into-the-inklands-booster-2",
      "into-the-inklands-booster-3",
    ]) {
      const dir = path.join(productsDir, slug, "fr");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "art.disneysite.png"), "png");
    }

    const index = emptyProductsIndex("lorcana");
    const out = promoteOrphanSealedProductsFromDisk({
      packId: "lorcana",
      index,
      productsDir,
      category: "official-site",
    });

    expect(out.written).toBe(1);
    expect(out.skippedNumbered).toBe(2);
    expect(Object.keys(index.products)).toEqual([
      "lorcana::into-the-inklands-booster",
    ]);
  });

  it("does not overwrite an existing index row", () => {
    const productsDir = path.join(root, "products");
    const artDir = path.join(productsDir, "into-the-inklands-booster", "fr");
    mkdirSync(artDir, { recursive: true });
    writeFileSync(path.join(artDir, "art.disneysite.png"), "png");

    const index = emptyProductsIndex("lorcana");
    index.products["lorcana::into-the-inklands-booster"] = {
      slug: "into-the-inklands-booster",
      path: "",
      kind: "booster",
      behavior: "random_pack",
      category: "official-site",
      name: "Existing",
      image: "/assets/lorcana/products/into-the-inklands-booster/fr/face",
      imageBack: null,
      setLogo: null,
      setCode: "3",
      catalogueSetId: "3",
      lang: "fr",
      releaseDate: null,
      priceCents: null,
      cardsPerPack: 12,
      packsContained: 1,
      guaranteedPrints: [],
      randomPoolScope: "set",
      randomPoolPrints: [],
      declaredCardCount: null,
      setCardCount: null,
      contentsKnown: false,
      containsPrintsIsPreview: true,
      prints: [],
    };

    const out = promoteOrphanSealedProductsFromDisk({
      packId: "lorcana",
      index,
      productsDir,
    });
    expect(out.written).toBe(0);
    expect(out.skippedExisting).toBe(1);
    expect(index.products["lorcana::into-the-inklands-booster"]!.name).toBe(
      "Existing",
    );
  });
});
