import type {
  CardsIndexEntry,
  CardsIndexLangFiles,
} from "@/effects/cardsIndex";
import {
  lenticularViewportContentSize,
} from "@/core/render/kayouLenticularArt";

import type { FaceQuarterTurns } from "./cardFormat";

export type ArtFaceOrientation = {
  landscapeFace?: boolean;
  faceQuarterTurns?: FaceQuarterTurns;
};

/**
 * How to frame one face from pixel dimensions.
 *
 * - Scan already landscape (w > h): wide frame, no rotation.
 * - Portrait scan of a print known to be landscape: rotate 90° (BREAK-style).
 * - Portrait scan of a normal print: upright portrait frame.
 */
export function resolveArtFaceOrientation(
  width: number,
  height: number,
  opts?: { printIsLandscape?: boolean },
): ArtFaceOrientation {
  if (!(width > 0 && height > 0)) return {};
  if (width > height) return { landscapeFace: true };
  if (opts?.printIsLandscape) return { faceQuarterTurns: 1 };
  return {};
}

export function artSlotIsLandscape(
  slot: Pick<CardsIndexLangFiles, "artW" | "artH">,
): boolean {
  return (
    typeof slot.artW === "number" &&
    typeof slot.artH === "number" &&
    slot.artW > slot.artH
  );
}

/** True when any locale art for this print is a landscape scan. */
export function printIsLandscapeCard(entry: CardsIndexEntry): boolean {
  if (entry.landscapePrint === true) return true;
  return Object.values(entry.langs).some(artSlotIsLandscape);
}

/**
 * One lenticular panel wider than tall → native landscape face (no 90° rotate).
 * Uses attested scan crop when the grid has a Kayou crop pattern.
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

/** Merge catalogue hints with live pixel dimensions (client-safe). */
export function mergeArtFaceOrientation(
  server: ArtFaceOrientation & { landscapePrint?: boolean },
  width: number,
  height: number,
): ArtFaceOrientation {
  if (!(width > 0 && height > 0)) return server;
  // Lenticular landscape panel — catalogue already framed wide; do not remap
  // the portrait strip to a quarter-turn when pixels load.
  if (server.landscapeFace === true) return { landscapeFace: true };
  const printIsLandscape =
    server.landscapePrint === true || server.faceQuarterTurns === 1;
  return resolveArtFaceOrientation(width, height, { printIsLandscape });
}
