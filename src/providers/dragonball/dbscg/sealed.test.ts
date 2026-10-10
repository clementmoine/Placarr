/**
 * Regression: Bandai Asia official Pieces tables for SD01 / BE20.
 * Empty-honest OK for SD08 until a Pieces table is attested.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { CuratedSealedContentsFile } from "@/providers/shared/sealedProducts/curatedContents";

const curated = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "curated",
  "products-contents.json",
);

function load(): CuratedSealedContentsFile {
  return JSON.parse(readFileSync(curated, "utf8")) as CuratedSealedContentsFile;
}

function qtySum(sku: CuratedSealedContentsFile["skus"][string]): number {
  const rows = sku.guaranteedPrints ?? [];
  return rows.reduce((n, r) => n + (r.qty ?? 1), 0);
}

describe("dbscg sealed products-contents (Bandai Asia)", () => {
  it("SD01 The Awakening — 51 cards with official qty", () => {
    const sku = load().skus["sd01-the-awakening"];
    expect(sku?.contentsKnown).toBe(true);
    expect(sku?.declaredCardCount).toBe(51);
    expect(sku?.containsPrintsIsPreview).toBe(false);
    expect(qtySum(sku!)).toBe(51);
    expect(sku!.guaranteedPrints?.find((r) => r.printKey === "dbscg:sd1-02")?.qty).toBe(
      4,
    );
    expect(sku!.source).toContain("dbs-sd01.php");
  });

  it("BE20 Ultimate Deck 2022 — 51 cards + official qty", () => {
    const sku =
      load().skus[
        "be20-ultimate-deck-2022-ex20-cell-return-of-the-ultimate-lifeform"
      ];
    expect(sku?.contentsKnown).toBe(true);
    expect(sku?.declaredCardCount).toBe(51);
    expect(qtySum(sku!)).toBe(51);
    expect(sku!.guaranteedPrints?.find((r) => r.printKey === "dbscg:ex20-01")?.qty).toBe(
      1,
    );
    expect(
      sku!.guaranteedPrints?.some((r) => r.printKey === "dbscg:bt11-063"),
    ).toBe(true);
    expect(sku!.source).toContain("dbs-es20.php");
  });

  it("SD08 Rising Broly — taille 51 attestée, liste Pieces encore absente", () => {
    const sku = load().skus["sd08-rising-broly"];
    expect(sku?.declaredCardCount).toBe(51);
    expect(sku?.contentsKnown).toBe(false);
    expect(sku?.containsPrintsIsPreview).toBe(true);
  });

  it.each([
    ["coffret-dragon-ball-super-card-game-theme-selection-history-of-son-goku", "dbscg:bt9-131"],
    ["coffret-dragon-ball-super-card-game-theme-selection-vegeta", "dbscg:ex12-02"],
  ] as const)("%s — 15 réimpressions fixes (Bandai)", (slug, sampleKey) => {
    const sku = load().skus[slug];
    expect(sku?.contentsKnown).toBe(true);
    expect(sku?.declaredCardCount).toBe(15);
    expect(qtySum(sku!)).toBe(15);
    expect(sku!.guaranteedPrintKeys).toContain(sampleKey);
    expect(sku!.source).toContain("dbs-ts0");
  });

  it("blisters Unison = 1 booster sous carton, pas un carton de display", () => {
    const sku =
      load().skus[
        "booster-carton-unison-warrior-series-boost-bt16-realm-of-the-gods-whis-beerus"
      ];
    expect(sku?.packsContained).toBe(1);
    expect(sku?.behavior).toBe("pack_container");
    expect(sku?.contentsKnown).toBe(false);
  });

  it.each([
    ["premium-anniversary-box-2023", 104],
    ["premium-seventh-anniversary-box-2024", 104],
    ["special-5th-anniversary-box", 97],
    ["special-anniversary-box-2021-vegeta-version-2", 96],
    ["special-anniversary-box", 96],
  ] as const)("%s — %i cartes déclarées (Bandai)", (slug, declared) => {
    const sku = load().skus[slug];
    expect(sku?.declaredCardCount).toBe(declared);
    expect(sku?.contentsKnown).toBe(false);
  });

  it("gift boxes — packs contenus attestés", () => {
    const skus = load().skus;
    expect(skus["gc01-gift-collection-2023"]?.packsContained).toBe(4);
    expect(
      skus["coffret-dragon-ball-super-card-game-gift-collection-gc-02"]
        ?.packsContained,
    ).toBe(5);
    expect(skus["ge01-coffret-gift-box-2018"]?.packsContained).toBe(7);
  });
});
