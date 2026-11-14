import { describe, expect, it } from "vitest";

import type { BuyProduct } from "../buyAdvice";
import { withContainerPackCompositions } from "../buyAdvice";
import composition from "@/providers/lorcana/lorcanajson/curated/booster-composition.json";
import {
  profileToSkuPackComposition,
  type BoosterCompositionFile,
} from "@/providers/shared/sealedProducts/boosterComposition";
import { sealedSkuFromProduct } from "./fromLegacy";

const file = composition as BoosterCompositionFile;

describe("sealedSkuFromProduct", () => {
  it("random_pack + packComposition SKU → 1 sachet, taux par print", () => {
    const packComposition = profileToSkuPackComposition(file.default);
    const product: BuyProduct = {
      slug: "booster-set-3",
      name: "Booster",
      kind: "booster",
      behavior: "random_pack",
      packSize: 12,
      priceCents: 450,
      packComposition,
    };
    const pool = Array.from({ length: 90 }, (_, i) => ({
      printKey: `c${i}`,
      rarity: "Commune",
    }));
    const sku = sealedSkuFromProduct({ product, pool });
    expect(sku.packs).toBe(1);
    expect(sku.guaranteed).toEqual([]);
    expect(sku.packHitByPrint?.size).toBeGreaterThan(0);
    expect(sku.provenance).not.toBe("unknown");
  });

  it("packComposition « none » : pas de repli sur les taux set", () => {
    const product: BuyProduct = {
      slug: "coffret-cadeau-fabuleux-elsa",
      name: "Elsa gift",
      kind: "collector_box",
      behavior: "mixed_bundle",
      packsInContainer: 5,
      packComposition: "none",
      prints: [],
      priceCents: 1500,
    };
    const pool = Array.from({ length: 40 }, (_, i) => ({
      printKey: `c${i}`,
      rarity: "Commune",
    }));
    const packsPerHitByPrint = new Map(pool.map((row) => [row.printKey, 6]));
    const sku = sealedSkuFromProduct({ product, pool, packsPerHitByPrint });
    expect(sku.packs).toBe(5);
    expect(sku.packHitByPrint).toBeNull();
  });

  it("mixed_bundle : garanties ET sachets (plus de perte d'un côté)", () => {
    const packComposition = profileToSkuPackComposition(file.default);
    const product: BuyProduct = {
      slug: "gift-set",
      name: "Gift set",
      kind: "gift_set",
      behavior: "mixed_bundle",
      packsInContainer: 4,
      prints: ["promo-1", "promo-2"],
      contentsKnown: true,
      priceCents: 3000,
      packComposition,
    };
    const pool = Array.from({ length: 90 }, (_, i) => ({
      printKey: `c${i}`,
      rarity: "Commune",
    }));
    const sku = sealedSkuFromProduct({ product, pool });
    expect(sku.guaranteed).toEqual(["promo-1", "promo-2"]);
    expect(sku.guaranteedPartial).toBe(false);
    expect(sku.packs).toBe(4);
    expect(sku.packHitByPrint?.size).toBeGreaterThan(0);
  });

  it("known_bundle aperçu : rien de garanti, partiel", () => {
    const product: BuyProduct = {
      slug: "deck",
      name: "Deck",
      kind: "starter",
      behavior: "known_bundle",
      prints: ["a", "b"],
      printsArePreview: true,
      priceCents: 2000,
    };
    const sku = sealedSkuFromProduct({ product });
    expect(sku.guaranteed).toEqual([]);
    expect(sku.guaranteedPartial).toBe(true);
    expect(sku.packs).toBe(0);
  });

  it("display hérite la composition du booster via withContainerPackCompositions", () => {
    const packComposition = profileToSkuPackComposition(file.default);
    const products = withContainerPackCompositions([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        setId: "3",
        language: "fr",
        packSize: 12,
        packComposition,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        setId: "3",
        language: "fr",
        packsInContainer: 24,
      },
    ]);
    const display = products.find((p) => p.slug === "display")!;
    const sku = sealedSkuFromProduct({
      product: display,
      pool: [{ printKey: "c0", rarity: "Commune" }],
    });
    expect(sku.packs).toBe(24);
    expect(sku.packHitByPrint?.size).toBeGreaterThan(0);
  });

  it("pool listé (avant-première) : uniforme sur la liste", () => {
    const product: BuyProduct = {
      slug: "preview",
      name: "Avant-première",
      kind: "booster",
      behavior: "random_pack",
      randomPoolScope: "listed",
      randomPoolPrints: ["x1", "x2", "x3", "x4"],
      packSize: 1,
      priceCents: 300,
    };
    const sku = sealedSkuFromProduct({ product });
    expect(sku.packs).toBe(1);
    expect(sku.packHitByPrint?.get("x1")).toBeCloseTo(0.25, 12);
  });
});
