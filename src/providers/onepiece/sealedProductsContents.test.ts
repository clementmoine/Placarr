/**
 * Regression: Tier One 収録枚数 for ST-29–35 (Bandai has no Pieces tables).
 * ST-36 membership only until qty attested.
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

describe("onepiece sealed products-contents (Tier One Pieces)", () => {
  it.each([
    ["st29-deck-de-demarrage-egg-head", "onepiece:st29-002", 4],
    ["st30-deck-de-demarrage-ex-luffy-et-ace", "onepiece:st30-003", 4],
    ["st31-deck-pour-debutant-monkey-d-luffy-rouge", "onepiece:st21-001", 1],
    ["st32-deck-pour-debutant-roronoa-zoro-vert", "onepiece:op12-023", 4],
    ["st33-deck-pour-debutant-kuzan-bleu", "onepiece:op12-040", 1],
    ["st34-deck-pour-debutant-charlotte-katakuri-violet", "onepiece:st34-001", 2],
    ["st35-deck-pour-debutant-rouge-noir-sabo", "onepiece:p-105", 4],
  ] as const)("%s — Σ=51 known", (slug, sampleKey, sampleQty) => {
    const sku = load().skus[slug];
    expect(sku?.contentsKnown).toBe(true);
    expect(sku?.declaredCardCount).toBe(51);
    expect(sku?.containsPrintsIsPreview).toBe(false);
    expect(qtySum(sku!)).toBe(51);
    expect(sku!.guaranteedPrints?.find((r) => r.printKey === sampleKey)?.qty).toBe(
      sampleQty,
    );
    // Regression: ST-31–36 preview mistakenly copied OP16 keys.
    expect(sku!.guaranteedPrintKeys).not.toContain("onepiece:op16-065");
  });

  it("ST-32 Kawamatsu is OP12-023 (not Perona OP10-036 duplicate)", () => {
    const sku = load().skus["st32-deck-pour-debutant-roronoa-zoro-vert"]!;
    expect(sku.guaranteedPrintKeys).toContain("onepiece:op12-023");
    expect(sku.guaranteedPrintKeys).toContain("onepiece:op10-036");
    expect(
      sku.guaranteedPrints?.filter((r) => r.printKey === "onepiece:op10-036"),
    ).toHaveLength(1);
  });

  it("ST-36 — membership 15, qty still unknown", () => {
    const sku = load().skus["st36-deck-pour-debutant-eustass-captain-kidd-jaune"];
    expect(sku?.declaredCardCount).toBe(51);
    expect(sku?.contentsKnown).toBe(false);
    expect(sku?.guaranteedPrintKeys).toContain("onepiece:op10-099");
    expect(sku?.guaranteedPrintKeys).toContain("onepiece:st36-005");
    expect(sku?.guaranteedPrintKeys).not.toContain("onepiece:op16-065");
    expect(sku?.guaranteedPrints?.length ?? 0).toBe(0);
  });

  it.each([
    ["starter-deck-01-straw-hat-crew", "onepiece:st01-001", 1, 51],
    ["starter-deck-02-worst-generation", "onepiece:st02-001", 1, 51],
    ["starter-deck-03-the-seven-warlords-of-the-sea", "onepiece:st03-001", 1, 51],
    ["starter-deck-04-animal-kingdom-pirates", "onepiece:st04-001", 1, 51],
    ["starter-deck-05-one-piece-film-edition", "onepiece:st05-011", 2, 51],
    ["starter-deck-06-absolute-justice", "onepiece:st06-001", 1, 51],
    ["starter-deck-07-big-mom-pirates", "onepiece:st07-001", 1, 51],
    ["starter-deck-10-the-three-captains", "onepiece:st10-001", 1, 53],
    ["deck-de-demarrage-ex-st21-gear-5th", "onepiece:st21-001", 1, 51],
    // ST-14 3D2Y — SR 003/006 ×2, events/stage ×2, commons ×4 (Tier One).
    ["starter-deck-14-3d2y", "onepiece:st14-003", 2, 51],
    // Decks JA (anniversaire 2/3 ans) — Tier One 収録枚数, clés Punk Records.
    ["japanese-starter-deck-st19-smoker", "onepiece:op02-093", 1, 51],
    ["japanese-starter-deck-st20-charlotte-katakuri", "onepiece:st20-001", 2, 51],
    ["japanese-starter-deck-st22-edward-and-ace", "onepiece:st22-002", 2, 51],
    ["japanese-starter-deck-st23-shanks", "onepiece:st23-001", 2, 51],
    // ST-24 : table Tier One inversait 004/005 — Punk Records: 004=Law&Bepo SR ×2.
    ["japanese-starter-deck-st24-jewelry-bonney", "onepiece:st24-004", 2, 51],
    ["japanese-starter-deck-st25-buggy", "onepiece:p-084", 4, 51],
    ["japanese-starter-deck-st26-monkey-d-luffy", "onepiece:st14-010", 4, 51],
    // ST-27 : Wolf réimprimé = OP10-084 (la table Tier One disait OP09-084 = Devon).
    ["japanese-starter-deck-st27-marshall-d-teach", "onepiece:op10-084", 4, 51],
    // ST-28 : leader = OP06-022 Yamato (la table Tier One disait OP09-042 = Buggy).
    ["japanese-starter-deck-st28-yamato", "onepiece:op06-022", 1, 51],
    // ST-13 Ultra Deck : 3 leaders + 50 (2 cartes de remplacement incluses).
    ["st13-ultra-deck-the-three-brothers", "onepiece:st13-001", 1, 53],
    // Mirrors JA / pré-release des decks FR attestés.
    ["japanese-starter-deck-st29-egghead", "onepiece:st29-002", 4, 51],
    ["starter-deck-ex-st21-gear-5th", "onepiece:st21-001", 1, 51],
    ["super-pre-release-starter-deck-04-animal-kingdom-pirates", "onepiece:st04-001", 1, 51],
  ] as const)("%s — Tier One legacy Pieces", (slug, sampleKey, sampleQty, sum) => {
    const sku = load().skus[slug];
    expect(sku?.contentsKnown).toBe(true);
    expect(sku?.declaredCardCount).toBe(sum);
    expect(qtySum(sku!)).toBe(sum);
    expect(sku!.guaranteedPrints?.find((r) => r.printKey === sampleKey)?.qty).toBe(
      sampleQty,
    );
  });

  it("ST-05 uses ST05-011/013 not ST06 typos", () => {
    const sku = load().skus["starter-deck-05-one-piece-film-edition"]!;
    expect(sku.guaranteedPrintKeys).toContain("onepiece:st05-011");
    expect(sku.guaranteedPrintKeys).toContain("onepiece:st05-013");
    expect(sku.guaranteedPrintKeys).not.toContain("onepiece:st06-011");
    expect(sku.guaranteedPrintKeys).not.toContain("onepiece:st06-013");
  });
});
