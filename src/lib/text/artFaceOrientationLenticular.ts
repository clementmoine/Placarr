import type {
  CardsIndexEntry,
  CardsIndexLangFiles,
} from "@/effects/cardsIndex";
import { lenticularViewportContentSize } from "@/core/render/kayouLenticularArt";

import {
  printIsLandscapeCard,
  resolveArtFaceOrientation,
  type ArtFaceOrientation,
} from "./artFaceOrientation";

/**
 * One lenticular panel wider than tall → native landscape face (no 90° rotate).
 * Uses attested scan crop when the grid has a Kayou crop pattern.
 *
 * Kept out of `artFaceOrientation.ts` so ItemCard / useArtFaceOrientation do
 * not pull kayouLenticularArt (~39 KB) into every shelf tile.
 */
export function orientationFromLenticularGrid(
  naturalWidth: number,
  naturalHeight: number,
  grid: { cols: number; rows: number },
  panelCrops?: ReadonlyArray<{
    left: number;
    top: number;
    right: number;
    bottom: number;
    shiftY?: number;
  }> | null,
): ArtFaceOrientation {
  const { w, h } = lenticularViewportContentSize(
    naturalWidth,
    naturalHeight,
    grid,
    panelCrops,
  );
  if (w > h) return { landscapeFace: true };
  return {};
}

export function orientationFromIndexSlot(
  entry: CardsIndexEntry,
  slot: CardsIndexLangFiles,
): ArtFaceOrientation {
  const w = slot.artW;
  const h = slot.artH;
  if (typeof w === "number" && typeof h === "number") {
    const grid = entry.lenticularGrid;
    if (grid && grid.cols * grid.rows > 1) {
      const lenticular = orientationFromLenticularGrid(w, h, grid);
      if (lenticular.landscapeFace) return lenticular;
    }
    return resolveArtFaceOrientation(w, h, {
      printIsLandscape: printIsLandscapeCard(entry),
    });
  }
  return {};
}
