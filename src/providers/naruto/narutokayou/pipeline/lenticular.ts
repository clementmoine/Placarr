/**
 * Kayou lenticular grids, landscape pivots, and seam probes.
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

import { NARUTO_KAYOU_PACK_ID } from "../pack";

export type { LenticularGrid };
export {
  KAYOU_LENTICULAR_CROP_PROFILE_DUAL_WAVE,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X2,
  KAYOU_LENTICULAR_CROP_PROFILE_HEAVEN_2X3,
};


// ─── landscapePrints ───

/** `nrz08.hr.001` / `nr.hr.121` / `nr.ss.hr.011` — rarity token before the number. */
export function kayouCardNumberIsCompactPivotRarity(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 2) return false;
  const tier = parts[parts.length - 2] ?? "";
  return tier === "hr" || tier === "mr" || tier === "pr";
}

/** @deprecated use kayouCardNumberIsCompactPivotRarity */
export function kayouCardNumberIsHrOrMr(cardNumber: string): boolean {
  return kayouCardNumberIsCompactPivotRarity(cardNumber);
}

/** `cc.*` or ledger `nr.cc.*` — Ninja Age Box wave. */
export function kayouCardNumberIsCcSeries(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts[0] === "cc") return true;
  return parts[0] === "nr" && parts[1] === "cc";
}

/** Tier token after `cc` (`cc.r.001` / `nr.cc.sr.024` / `nr.cc.mr.001s`). */
function kayouCcSeriesTier(cardNumber: string): string | null {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts[0] === "cc") return parts[1] ?? null;
  if (parts[0] === "nr" && parts[1] === "cc") return parts[2] ?? null;
  return null;
}

/**
 * Ninja Age story / wedding panels — portrait scan of a landscape card.
 * `r` / `sr` + wedding `mr.*s` (not character `mr.001`–`005`, ptr/qr/sp/ur…).
 */
export function kayouCardNumberIsCcRotatedLandscapeWave(cardNumber: string): boolean {
  const tier = kayouCcSeriesTier(cardNumber);
  if (tier === "r" || tier === "sr") return true;
  // Wedding MRs (`cc.mr.001s`) are landscape pivots; Akatsuki MRs stay portrait.
  if (tier === "mr") {
    const parts = cardNumber.trim().toLowerCase().split(".");
    return /s$/i.test(parts[parts.length - 1] ?? "");
  }
  return false;
}

const KAYOU_CC_WAVE_MIN_W = 250;
const KAYOU_CC_WAVE_MAX_W = 270;
const KAYOU_CC_WAVE_MIN_H = 350;
const KAYOU_CC_WAVE_MAX_H = 380;

function kayouScanIsCcWaveRotatedLandscape(
  width: number,
  height: number,
  cardNumber: string,
): boolean {
  if (!kayouCardNumberIsCcRotatedLandscapeWave(cardNumber)) return false;
  return (
    width >= KAYOU_CC_WAVE_MIN_W &&
    width <= KAYOU_CC_WAVE_MAX_W &&
    height >= KAYOU_CC_WAVE_MIN_H &&
    height <= KAYOU_CC_WAVE_MAX_H
  );
}

/** Set-prefixed wave promo pivots (`nrz07.pr.060`), not catalogue `nr.pr.*`. */
function kayouCardNumberIsWavePrPivot(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 3) return false;
  return /^nrz\d{2}$/.test(parts[0]!) && parts[1] === "pr";
}

/**
 * Catalogue `nr.pr.*` CDN scans (~400×560) attested as portrait-of-landscape
 * pivots (characters sideways in the file). Compact CapsuleCorp (~257×361)
 * and other CDN promos (055–057, 059, 071–072…) stay upright.
 */
const KAYOU_CDN_LANDSCAPE_PROMO_NUMBERS: ReadonlySet<number> = new Set([
  58, 60, 61, 62, 68, 69, 70,
]);

function kayouCataloguePrCollectorNumber(cardNumber: string): number | null {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 3 || parts[0] !== "nr" || parts[1] !== "pr") return null;
  const n = Number.parseInt(parts[2]!, 10);
  return Number.isFinite(n) ? n : null;
}

function kayouScanIsCataloguePrRotatedLandscape(
  width: number,
  height: number,
  cardNumber: string,
): boolean {
  const num = kayouCataloguePrCollectorNumber(cardNumber);
  if (num == null || !KAYOU_CDN_LANDSCAPE_PROMO_NUMBERS.has(num)) return false;
  return (
    width >= 380 &&
    width <= 420 &&
    height >= 540 &&
    height <= 590
  );
}

/** Episode / comic panel titles end with a part number (`… 1`, `… 5`),
 * or CapsuleCorp stubs that only have the short rarity-number (`R-111`). */
export function kayouNameLooksLikeStoryPanel(
  name: string | null | undefined,
): boolean {
  const n = name?.trim() ?? "";
  if (!n) return false;
  if (/\s\d+\s*$/.test(n)) return true;
  return /^(R|SR)-\d+$/i.test(n);
}

/** Story-wave rarities that carry multi-part episode panels. */
function kayouCardNumberIsStoryPanelTier(cardNumber: string): boolean {
  const parts = cardNumber.trim().toLowerCase().split(".");
  if (parts.length < 2) return false;
  const tier = parts[parts.length - 2] ?? "";
  return tier === "r" || tier === "sr";
}

/**
 * CapsuleCorp / CDN portrait scans of landscape story panels
 * (t2w7 `nr.r.161` ≈ 400×568; Ninja Age `cc.r` handled separately).
 */
function kayouScanIsStoryPanelRotatedLandscape(
  width: number,
  height: number,
  cardNumber: string,
  name: string | null | undefined,
): boolean {
  if (!kayouNameLooksLikeStoryPanel(name)) return false;
  if (!kayouCardNumberIsStoryPanelTier(cardNumber)) return false;
  if (kayouCardNumberIsCcSeries(cardNumber)) return false;
  return (
    width >= 250 &&
    width <= 420 &&
    height >= 350 &&
    height <= 590
  );
}

/**
 * Portrait scan that should display as landscape (90° rotation), not a
 * lenticular strip kept upright.
 */
export function kayouScanIsRotatedLandscape(
  width: number,
  height: number,
  rarity: string | null | undefined,
  cardNumber?: string | null,
  name?: string | null,
): boolean {
  if (!(width > 0 && height > 0) || width > height) return false;
  if (cardNumber && kayouScanIsCcWaveRotatedLandscape(width, height, cardNumber)) {
    return true;
  }
  if (
    cardNumber &&
    kayouScanIsStoryPanelRotatedLandscape(width, height, cardNumber, name)
  ) {
    return true;
  }
  // Other cc.* tiers (ptr/qr/sp/ur…) — portrait cards, not story-panel pivots.
  if (cardNumber && kayouCardNumberIsCcSeries(cardNumber)) return false;
  if (
    cardNumber &&
    kayouScanIsCataloguePrRotatedLandscape(width, height, cardNumber)
  ) {
    return true;
  }
  // Other catalogue promos `nr.pr.*` are upright (CapsuleCorp compact / CDN).
  if (
    cardNumber &&
    /\.pr\./i.test(cardNumber) &&
    !kayouCardNumberIsWavePrPivot(cardNumber)
  ) {
    return false;
  }
  const rRaw = rarity?.trim().toUpperCase() ?? "";
  // Ledgers use `SS-HR` / `CC-R` prefixes for the same rarity tokens.
  const r = rRaw.replace(/^(SS|CC)-/, "");
  if (r !== "HR" && r !== "MR" && r !== "PR") return false;
  // Wave PR pivots only (`nrz07.pr.060`) — same compact window as NRZ08 HR.
  if (r === "PR" && cardNumber && !kayouCardNumberIsWavePrPivot(cardNumber)) {
    return false;
  }
  // Lenticular strip — 2–3 faces stacked (t4w4 `nr.hr.*`, Heaven Scrolls…).
  if (width >= 280 && height >= 400) return false;
  // NRZ08-style MR pivots only (~186×264). Larger CapsuleCorp scans
  // (`nrb07.mr.069` ≈ 268×378) are upright character cards.
  if (r === "MR") {
    if (width >= 240 || height >= 320) return false;
    return width >= 170 && height >= 230;
  }
  // NRZ08-style HR + New Year `nr.ss.hr.*` compact pivots (~257×361).
  const KAYOU_ROTATED_LANDSCAPE_MAX_W = 270;
  const KAYOU_ROTATED_LANDSCAPE_MAX_H = 380;
  if (width >= KAYOU_ROTATED_LANDSCAPE_MAX_W || height >= KAYOU_ROTATED_LANDSCAPE_MAX_H) {
    return false;
  }
  // Compact portrait scan ≈ NRZ08 wave and similar rotated landscape cards.
  return width >= 170 && height >= 230;
}

/** Auto-managed `landscapePrint` flags from Kayou scan heuristics. */
export function kayouEntryUsesRotatedLandscapeHeuristic(entry: {
  card: string;
  rarity?: string | null;
  name?: string | null;
}): boolean {
  // All cc.* / nr.cc.* marks are pipeline-owned (incl. stale ptr/qr from old rules).
  if (kayouCardNumberIsCcSeries(entry.card)) return true;
  // All PR marks are pipeline-owned so stale `nr.pr.*` landscape flags clear.
  if (/\.pr\./i.test(entry.card)) return true;
  // Story R/SR panels (chapter titles) — pipeline-owned landscape pivots.
  if (
    kayouNameLooksLikeStoryPanel(entry.name) &&
    kayouCardNumberIsStoryPanelTier(entry.card)
  ) {
    return true;
  }
  const rarityRaw =
    entry.rarity?.trim().toUpperCase() ??
    (kayouCardNumberIsCompactPivotRarity(entry.card)
      ? (entry.card.trim().toLowerCase().split(".").at(-2) ?? "").toUpperCase()
      : null);
  const rarity = rarityRaw?.replace(/^(SS|CC)-/, "") ?? null;
  return rarity === "HR" || rarity === "MR" || rarity === "PR";
}

function firstArtDimensions(
  entry: CardsIndexV1["cards"][string],
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

/** Re-apply after `enrichCardsIndexArtDimensions` — pixels alone miss NRZ08 HR. */
export function markKayouRotatedLandscapePrints(
  packId: string = NARUTO_KAYOU_PACK_ID,
): { marked: number; cleared: number } {
  const dest = packCardsIndexPath(packId);
  const raw = JSON.parse(readFileSync(dest, "utf8")) as unknown;
  if (!isCardsIndexV1(raw)) {
    throw new Error(`cards-index invalide : ${dest}`);
  }
  const index = raw as CardsIndexV1;
  let marked = 0;
  let cleared = 0;

  for (const entry of Object.values(index.cards)) {
    const dims = firstArtDimensions(entry);
    if (!dims) continue;
    const rarity =
      entry.rarity ??
      (kayouCardNumberIsCompactPivotRarity(entry.card)
        ? (entry.card.trim().toLowerCase().split(".").at(-2) ?? "").toUpperCase()
        : null);
    const want = kayouScanIsRotatedLandscape(
      dims.width,
      dims.height,
      rarity,
      entry.card,
      entry.name,
    );
    if (want) {
      if (!entry.landscapePrint) marked += 1;
      entry.landscapePrint = true;
    } else if (
      entry.landscapePrint &&
      kayouEntryUsesRotatedLandscapeHeuristic(entry)
    ) {
      delete entry.landscapePrint;
      cleared += 1;
    }
  }

  writeFileSync(dest, `${JSON.stringify(index)}\n`);
  resetCardsIndexOrientationCache();
  return { marked, cleared };
}

// ─── lenticularSeamProbe ───

const DEFAULT_LUM = 235;
const DEFAULT_MIN_SEAM_WHITE = 0.5;
const SEAM_BAND_FRAC = 0.022;
/** 1×2 when the mid-row gutter is pale vs panel rows (New Year HR.011–012). */
const REL_1X2_MIN_HALF = 0.45;
const REL_1X2_MAX_PANEL_ROW = 0.15;
const REL_1X2_MIN_DELTA = 0.35;
/** Strong mid-row gutter (t4w5 Team 7) — below pure-white, above pale-relative. */
const STRONG_1X2_MIN_HALF = 0.75;
const STRONG_1X2_MIN_DELTA = 0.15;
/** Thin full-width gutters (New Year HR.017–018): core + full row nearly pure white. */
const PURE_SEAM_MIN_WHITE = 0.995;
const PURE_SEAM_CORE_MARGIN = 0.08;
const PURE_SEAM_SEARCH_FRAC = 0.06;

function rgbaLuminance(
  rgba: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
): number {
  const i = (y * width + x) * 4;
  return (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
}

function rowWhiteFractionInSpan(
  rgba: Uint8ClampedArray,
  width: number,
  y: number,
  x0: number,
  x1: number,
  lumThreshold: number,
): number {
  if (x1 <= x0) return 0;
  let white = 0;
  for (let x = x0; x < x1; x += 1) {
    if (rgbaLuminance(rgba, x, y, width) >= lumThreshold) white += 1;
  }
  return white / (x1 - x0);
}

/** Fraction of near-white pixels on a horizontal band centered at `y`. */
export function kayouRowSeamWhiteFraction(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  y: number,
  lumThreshold = DEFAULT_LUM,
): number {
  if (!(width > 0 && height > 0)) return 0;
  const band = Math.max(2, Math.round(height * SEAM_BAND_FRAC));
  let white = 0;
  let total = 0;
  for (let yy = Math.max(0, Math.round(y) - band); yy <= Math.min(height - 1, Math.round(y) + band); yy += 1) {
    for (let x = 0; x < width; x += 1) {
      total += 1;
      if (rgbaLuminance(rgba, x, yy, width) >= lumThreshold) white += 1;
    }
  }
  return total > 0 ? white / total : 0;
}

/** True when a near-pure white gutter row sits near `centerY` (offset seams, narrow gutters). */
export function hasKayouPureHorizontalSeamNear(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  centerY: number,
  minWhite = PURE_SEAM_MIN_WHITE,
  lumThreshold = DEFAULT_LUM,
): boolean {
  if (!(width > 0 && height > 0)) return false;
  const search = Math.max(8, Math.floor(height * PURE_SEAM_SEARCH_FRAC));
  const x0 = Math.floor(width * PURE_SEAM_CORE_MARGIN);
  const x1 = Math.floor(width * (1 - PURE_SEAM_CORE_MARGIN));
  const yStart = Math.max(0, Math.round(centerY) - search);
  const yEnd = Math.min(height - 1, Math.round(centerY) + search);

  for (let y = yStart; y <= yEnd; y += 1) {
    const core = rowWhiteFractionInSpan(rgba, width, y, x0, x1, lumThreshold);
    const full = rowWhiteFractionInSpan(rgba, width, y, 0, width, lumThreshold);
    if (core >= minWhite && full >= minWhite) return true;
  }
  return false;
}

/**
 * Infer a 1×N stacked strip from inter-row gutters, or null for a single face.
 */
export function probeKayouStackedStripGrid(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minSeamWhite = DEFAULT_MIN_SEAM_WHITE,
): LenticularGrid | null {
  if (!(width > 0 && height > 0)) return null;

  if (hasKayouPureHorizontalSeamNear(rgba, width, height, height / 2)) {
    return { cols: 1, rows: 2 };
  }

  if (
    hasKayouPureHorizontalSeamNear(rgba, width, height, height / 3) &&
    hasKayouPureHorizontalSeamNear(rgba, width, height, (2 * height) / 3)
  ) {
    return { cols: 1, rows: 3 };
  }

  const seamThird = kayouRowSeamWhiteFraction(rgba, width, height, height / 3);
  const seamHalf = kayouRowSeamWhiteFraction(rgba, width, height, height / 2);
  const seamTwoThirds = kayouRowSeamWhiteFraction(
    rgba,
    width,
    height,
    (2 * height) / 3,
  );

  const thirdStrong =
    seamThird >= minSeamWhite && seamTwoThirds >= minSeamWhite;
  if (thirdStrong) {
    return { cols: 1, rows: 3 };
  }

  if (seamHalf >= minSeamWhite) {
    const panelRow = Math.max(seamThird, seamTwoThirds);
    const minPanelRow = Math.min(seamThird, seamTwoThirds);
    if (
      seamHalf - panelRow >= REL_1X2_MIN_DELTA ||
      minPanelRow < REL_1X2_MAX_PANEL_ROW
    ) {
      return { cols: 1, rows: 2 };
    }
  }

  const panelRow = Math.max(seamThird, seamTwoThirds);
  if (
    seamHalf >= STRONG_1X2_MIN_HALF &&
    seamHalf - panelRow >= STRONG_1X2_MIN_DELTA
  ) {
    return { cols: 1, rows: 2 };
  }

  if (
    seamHalf >= REL_1X2_MIN_HALF &&
    seamThird < REL_1X2_MAX_PANEL_ROW &&
    seamTwoThirds < REL_1X2_MAX_PANEL_ROW &&
    seamHalf - panelRow >= REL_1X2_MIN_DELTA
  ) {
    return { cols: 1, rows: 2 };
  }

  return null;
}

// ─── lenticularGrid ───

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

function firstLenticularArtDimensions(
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
  const dims = firstLenticularArtDimensions(entry);
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
  const dims = firstLenticularArtDimensions(entry);
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
  const dims = firstLenticularArtDimensions(entry);

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
  opts?: { onProgress?: (message: string) => void },
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

  const entries = Object.values(index.cards);
  const total = entries.length;
  opts?.onProgress?.(`lenticulaire — sondage ${total} tirage(s)…`);
  let i = 0;
  for (const entry of entries) {
    i += 1;
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

    if (i % 500 === 0 || i === total) {
      opts?.onProgress?.(
        `lenticulaire — ${i}/${total} (${probed} sondée(s), ${marked} grille(s))`,
      );
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
