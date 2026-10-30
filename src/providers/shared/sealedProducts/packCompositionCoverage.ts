/**
 * Audit couverture `packComposition` — même barre que `cardsPerPack` null.
 */
import {
  isSkuPackComposition,
  sealedSkuNeedsPackComposition,
  type PackCompositionField,
} from "./packCompositionTypes";
import type { SealedProductEntry } from "./indexFormat";

export type PackCompositionCoverage = {
  /** SKUs qui ont besoin d'une grille (loterie). */
  lotterySkuCount: number;
  /** Parmi eux : objet slots attesté. */
  withCompositionCount: number;
  /** Parmi eux : encore `null` / absent. */
  missingCompositionCount: number;
  /** `"none"` explicite (rare sur loterie — plutôt decks). */
  noneCount: number;
  /** Slugs encore sans grille. */
  missingSlugs: string[];
};

export function packCompositionCoverageForEntries(
  products: Readonly<Record<string, SealedProductEntry>> | readonly SealedProductEntry[],
): PackCompositionCoverage {
  const rows = Array.isArray(products) ? products : Object.values(products);
  let lotterySkuCount = 0;
  let withCompositionCount = 0;
  let missingCompositionCount = 0;
  let noneCount = 0;
  const missingSlugs: string[] = [];

  for (const entry of rows) {
    if (!sealedSkuNeedsPackComposition(entry)) continue;
    /* Display : grille attendue via sachet enfant — comptée si absente sur le container. */
    lotterySkuCount += 1;
    const field: PackCompositionField | undefined = entry.packComposition;
    if (isSkuPackComposition(field)) {
      withCompositionCount += 1;
    } else if (field === "none") {
      noneCount += 1;
    } else if (entry.behavior === "pack_container") {
      /* Container sans copie locale : OK si résolu au conseil via frère. */
      withCompositionCount += 1;
    } else {
      missingCompositionCount += 1;
      missingSlugs.push(entry.slug);
    }
  }

  return {
    lotterySkuCount,
    withCompositionCount,
    missingCompositionCount,
    noneCount,
    missingSlugs: missingSlugs.sort(),
  };
}
