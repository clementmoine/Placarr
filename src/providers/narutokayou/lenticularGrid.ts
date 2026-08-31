/**
 * Kayou lenticular sprite grids — infer from scan size, seam probe, curated map.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  isCardsIndexV1,
  type CardsIndexEntry,
  type CardsIndexV1,
} from "@/effects/cardsIndex";
import type { LenticularGrid } from "@/core/render/kayouLenticularArt";
import {
  KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
  type LenticularPanelCrop,
} from "@/core/render/kayouLenticularArt";
import { detectKayouScanContentCrop } from "@/core/render/kayouScanCrop";
import {
  kayouScanIsAttestedLenticularStrip,
  kayouScanIsPortraitStrip,
} from "@/core/render/kayouScanFormat";
import { packCardDir, packCardsIndexPath } from "@/lib/packPaths";
import { resetCardsIndexOrientationCache } from "@/providers/shared/cardCatalogue/cardsIndexOrientation";

import { kayouScanIsRotatedLandscape } from "./landscapePrints";
import { probeKayouStackedStripGrid } from "./lenticularSeamProbe";
import { NARUTO_KAYOU_PACK_ID } from "./pack";

export type { LenticularGrid };
export {
  KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
};

/** Attested cols×rows for Heaven Scroll HR (320×450 strips). */
const HEAVEN_SCROLL_HR_GRID: Readonly<Record<string, LenticularGrid>> = {
  "nrss.hr.001": { cols: 1, rows: 3 },
  "nrss.hr.002": { cols: 2, rows: 2 },
  "nrss.hr.003": { cols: 1, rows: 3 },
  "nrss.hr.004": { cols: 2, rows: 2 },
  "nrss.hr.005": { cols: 2, rows: 3 },
  "nrss.hr.006": { cols: 1, rows: 3 },
  "nrss.hr.007": { cols: 1, rows: 3 },
  "nrss.hr.008": { cols: 1, rows: 2 },
  "nrss.hr.009": { cols: 2, rows: 2 },
  "nrss.hr.010": { cols: 1, rows: 3 },
};

export type KayouArtProbe = {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
};

/** Portrait strip ≈ 320×450 (narutocards.ca), including 2.4× CDN scale. */
export function kayouScanIsLenticularStrip(width: number, height: number): boolean {
  return kayouScanIsAttestedLenticularStrip(width, height);
}

function firstArtDimensions(
  entry: CardsIndexEntry,
): { width: number; height: number } | null {
  for (const slot of Object.values(entry.langs)) {
    if (
      typeof slot.artW === "number" &&
      typeof slot.artH === "number" &&
      slot.artW > 0 &&
      slot.artH > 0
    ) {
      return { width: slot.artW, height: slot.artH };
    }
  }
  return null;
}

function entryIsPortraitKayouScan(entry: CardsIndexEntry): boolean {
  const dims = firstArtDimensions(entry);
  if (!dims) return false;
  const rarity = entry.rarity?.trim().toUpperCase() ?? "";
  if (
    kayouScanIsRotatedLandscape(dims.width, dims.height, rarity, entry.card) ||
    entry.landscapePrint
  ) {
    return false;
  }
  return kayouScanIsPortraitStrip(dims.width, dims.height);
}

function resolveKayouArtPath(
  entry: CardsIndexEntry,
  packId: string,
): string | null {
  for (const [lang, slot] of Object.entries(entry.langs)) {
    const art = slot.art?.trim();
    if (!art) continue;
    const candidate = path.join(
      packCardDir(packId, { set: entry.set, lang, card: entry.card }),
      art,
    );
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function loadKayouArtProbe(
  entry: CardsIndexEntry,
  packId: string,
): Promise<KayouArtProbe | null> {
  const artPath = resolveKayouArtPath(entry, packId);
  if (!artPath) return null;
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(artPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      rgba: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}

function heavenScrollGrid(entry: CardsIndexEntry): LenticularGrid | null {
  const set = entry.set.trim().toLowerCase();
  const card = entry.card.trim().toLowerCase();
  if (set !== "smritiheavenscrolls1" || !card.startsWith("nrss.hr.")) {
    return null;
  }
  return HEAVEN_SCROLL_HR_GRID[card] ?? null;
}

function cropEqual(
  a: LenticularPanelCrop,
  b: LenticularPanelCrop,
): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom
  );
}

export function inferKayouLenticularGrid(
  entry: CardsIndexEntry,
  probe?: KayouArtProbe | null,
): LenticularGrid | null {
  const dims = firstArtDimensions(entry);
  if (!dims) return null;

  const rarity = entry.rarity?.trim().toUpperCase() ?? "";
  if (rarity !== "HR" && rarity !== "BP") return null;

  if (
    kayouScanIsRotatedLandscape(dims.width, dims.height, rarity, entry.card) ||
    entry.landscapePrint
  ) {
    return null;
  }

  // Full-size strips can be inferred without pixels (Heaven Scroll map). Smaller
  // same-aspect CDN scales (t4w1 `nr.hr.010` ≈ 282×411) need a seam probe.
  const stripCandidate = probe
    ? kayouScanIsPortraitStrip(dims.width, dims.height)
    : kayouScanIsLenticularStrip(dims.width, dims.height);
  if (!stripCandidate) return null;

  const attested = heavenScrollGrid(entry);
  if (attested) return attested;

  if (!probe) return null;

  return probeKayouStackedStripGrid(probe.rgba, probe.width, probe.height);
}

/** t4w wave HR dual-face strips — attested fixed crop, auto detection off. */
export function inferKayouLenticularCropProfile(
  entry: CardsIndexEntry,
  grid: LenticularGrid | null,
): string | null {
  if (!grid) return null;
  const set = entry.set.trim().toLowerCase();
  const card = entry.card.trim().toLowerCase();
  const dims = firstArtDimensions(entry);

  if (grid.cols === 1 && grid.rows === 2) {
    if (!/^t4w\d+$/.test(set)) return null;
    if (!card.startsWith("nr.hr.")) return null;
    if (!dims || !kayouScanIsAttestedLenticularStrip(dims.width, dims.height)) {
      return null;
    }
    return KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE;
  }

  if (grid.cols === 2 && grid.rows === 2) {
    if (set !== "smritiheavenscrolls1") return null;
    if (!dims || !kayouScanIsAttestedLenticularStrip(dims.width, dims.height)) {
      return null;
    }
    return KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2;
  }

  if (grid.cols === 2 && grid.rows === 3) {
    if (set !== "smritiheavenscrolls1") return null;
    if (!dims || !kayouScanIsAttestedLenticularStrip(dims.width, dims.height)) {
      return null;
    }
    return KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3;
  }

  return null;
}

export function inferKayouScanCrop(
  entry: CardsIndexEntry,
  probe?: KayouArtProbe | null,
): LenticularPanelCrop | null {
  if (!entryIsPortraitKayouScan(entry)) return null;
  const grid = inferKayouLenticularGrid(entry, probe);
  if (grid && grid.cols * grid.rows > 1) return null;
  if (probe) {
    return detectKayouScanContentCrop(probe.rgba, probe.width, probe.height);
  }
  return entry.scanCrop ?? null;
}

export function kayouLenticularGridForPrintKey(
  printKey: string,
  packId: string = NARUTO_KAYOU_PACK_ID,
): LenticularGrid | null {
  const key = printKey.trim().toLowerCase();
  try {
    const raw = JSON.parse(
      readFileSync(packCardsIndexPath(packId), "utf8"),
    ) as unknown;
    if (!isCardsIndexV1(raw)) return null;
    const entry = raw.cards[key];
    if (!entry) return null;
    if (entry.lenticularGrid) return entry.lenticularGrid;
    return inferKayouLenticularGrid(entry);
  } catch {
    return null;
  }
}

export function kayouScanCropForPrintKey(
  printKey: string,
  packId: string = NARUTO_KAYOU_PACK_ID,
): LenticularPanelCrop | null {
  const key = printKey.trim().toLowerCase();
  try {
    const raw = JSON.parse(
      readFileSync(packCardsIndexPath(packId), "utf8"),
    ) as unknown;
    if (!isCardsIndexV1(raw)) return null;
    const entry = raw.cards[key];
    if (!entry) return null;
    return inferKayouScanCrop(entry);
  } catch {
    return null;
  }
}

export function kayouLenticularCropProfileForPrintKey(
  printKey: string,
  packId: string = NARUTO_KAYOU_PACK_ID,
): string | null {
  const key = printKey.trim().toLowerCase();
  try {
    const raw = JSON.parse(
      readFileSync(packCardsIndexPath(packId), "utf8"),
    ) as unknown;
    if (!isCardsIndexV1(raw)) return null;
    const entry = raw.cards[key];
    if (!entry) return null;
    if (entry.lenticularCropProfile) return entry.lenticularCropProfile;
    const grid = entry.lenticularGrid ?? inferKayouLenticularGrid(entry);
    return inferKayouLenticularCropProfile(entry, grid);
  } catch {
    return null;
  }
}

/** Persist inferred grids + single-face scan crops on `cards-index.json`. */
export async function markKayouLenticularGrids(
  packId: string = NARUTO_KAYOU_PACK_ID,
): Promise<{
  marked: number;
  cleared: number;
  scanCropsMarked: number;
  scanCropsCleared: number;
  cropProfilesMarked: number;
  cropProfilesCleared: number;
  probed: number;
  missingArt: number;
}> {
  const dest = packCardsIndexPath(packId);
  const raw = JSON.parse(readFileSync(dest, "utf8")) as unknown;
  if (!isCardsIndexV1(raw)) {
    throw new Error(`cards-index invalide : ${dest}`);
  }
  const index = raw as CardsIndexV1;
  let marked = 0;
  let cleared = 0;
  let scanCropsMarked = 0;
  let scanCropsCleared = 0;
  let cropProfilesMarked = 0;
  let cropProfilesCleared = 0;
  let probed = 0;
  let missingArt = 0;

  for (const entry of Object.values(index.cards)) {
    const needsProbe = entryIsPortraitKayouScan(entry);

    let probe: KayouArtProbe | null = null;
    if (needsProbe) {
      probe = await loadKayouArtProbe(entry, packId);
      if (probe) probed += 1;
      else missingArt += 1;
    }

    const grid = inferKayouLenticularGrid(entry, probe);
    if (grid) {
      const prev = entry.lenticularGrid;
      if (!prev || prev.cols !== grid.cols || prev.rows !== grid.rows) {
        entry.lenticularGrid = grid;
        marked += 1;
      }
    } else if (entry.lenticularGrid) {
      delete entry.lenticularGrid;
      cleared += 1;
    }

    const scanCrop = inferKayouScanCrop(entry, probe);
    if (scanCrop) {
      const prev = entry.scanCrop;
      if (!prev || !cropEqual(prev, scanCrop)) {
        entry.scanCrop = scanCrop;
        scanCropsMarked += 1;
      }
    } else if (entry.scanCrop) {
      delete entry.scanCrop;
      scanCropsCleared += 1;
    }

    const cropProfile = inferKayouLenticularCropProfile(entry, grid);
    if (cropProfile) {
      if (entry.lenticularCropProfile !== cropProfile) {
        entry.lenticularCropProfile = cropProfile;
        cropProfilesMarked += 1;
      }
    } else if (entry.lenticularCropProfile) {
      delete entry.lenticularCropProfile;
      cropProfilesCleared += 1;
    }
  }

  writeFileSync(dest, `${JSON.stringify(index)}\n`);
  resetCardsIndexOrientationCache();
  return {
    marked,
    cleared,
    scanCropsMarked,
    scanCropsCleared,
    cropProfilesMarked,
    cropProfilesCleared,
    probed,
    missingArt,
  };
}
