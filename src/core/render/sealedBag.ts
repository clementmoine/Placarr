/**
 * Cross-TCG sealed-bag packaging overlay (double-pinch PE).
 *
 * Front: 9-slice bag face. Back: horizontally mirrored bag + centered peel strip.
 * Assets live under `public/assets/shared/packaging/` (clear PE, magenta keyed).
 *
 * Outer box = card aspect + thin seal/rim margins so the inner window matches
 * the print. The master PNG is crop source only — runtime uses slices.
 *
 * The card art must sit **inside** the bag window ({@link sealedCardInsetStyle}),
 * not full-bleed under a flat overlay — otherwise it reads as a sticker on plastic.
 */

export const SEALED_FINISH = "sealed";

const PACKAGING_BASE = "/assets/shared/packaging";
const SLICES_BASE = `${PACKAGING_BASE}/slices`;

/** Master bag (crop source for {@link SEALED_BAG_SLICES}). Not used at runtime. */
export const SEALED_BAG_MASTER_URL = `${PACKAGING_BASE}/card-bag-seal-both.png`;
/** @deprecated Use {@link SEALED_BAG_MASTER_URL}. */
export const SEALED_BAG_URL = SEALED_BAG_MASTER_URL;
/** @deprecated Use {@link SEALED_BAG_MASTER_URL}. */
export const SEALED_BAG_SEAL_BOTH_URL = SEALED_BAG_MASTER_URL;

export const SEALED_BAG_PEEL_STRIP_URL = `${PACKAGING_BASE}/card-bag-peel-strip.png`;

/** Native master PNG size (1682×2668). */
export const SEALED_BAG_PIXEL_SIZE = { width: 1682, height: 2668 } as const;

/**
 * 9-slice crops from {@link SEALED_BAG_MASTER_URL} (master 1682×2668).
 *
 * `sealH` covers the serrated edge + PE pinch (~9% of master height) so the
 * print window does not sit under the crimps.
 */
export const SEALED_BAG_SLICES = {
  rimW: 202,
  sealH: 236,
  windowW: 1278,
  windowH: 2196,
  urls: {
    cornerTl: `${SLICES_BASE}/corner-tl.png`,
    cornerTr: `${SLICES_BASE}/corner-tr.png`,
    cornerBl: `${SLICES_BASE}/corner-bl.png`,
    cornerBr: `${SLICES_BASE}/corner-br.png`,
    edgeTop: `${SLICES_BASE}/edge-top.png`,
    edgeBottom: `${SLICES_BASE}/edge-bottom.png`,
    edgeLeft: `${SLICES_BASE}/edge-left.png`,
    edgeRight: `${SLICES_BASE}/edge-right.png`,
    /** Clear PE speculars over the card window (center of the master). */
    windowFilm: `${SLICES_BASE}/window-film.png`,
  },
} as const;

/** Bare TCG poker size — the print window inside the bag must keep this. */
const TCG_FACE_ASPECT = 5 / 7;

/** Rim / seal as a fraction of the *card window* (not the outer bag). */
const ADAPTIVE_RIM_OVER_WINDOW =
  SEALED_BAG_SLICES.rimW / SEALED_BAG_SLICES.windowW;
const ADAPTIVE_SEAL_OVER_WINDOW =
  SEALED_BAG_SLICES.sealH / SEALED_BAG_SLICES.windowH;
/**
 * Extra gap between pinch chrome and the print (fraction of card window), so
 * the art never sits under the crimp lines.
 */
const ADAPTIVE_PINCH_CLEARANCE = 0.018;
/**
 * Share of the total vertical margin assigned to the *top* (rest → bottom).
 * Below 0.5 nudges the print slightly upward, without dipping under the
 * top pinch chrome (~0.44 is the floor for the current clearance).
 */
const ADAPTIVE_CARD_TOP_SHARE = 0.445;

function marginOverWindow(base: number, clearance = 0): number {
  return base + clearance;
}

function insetPctFromWindowMargin(marginOverWindow: number): string {
  return pct(marginOverWindow / (1 + 2 * marginOverWindow));
}

function adaptiveVerticalMarginsOverWindow(): {
  top: number;
  bottom: number;
  total: number;
} {
  const each = marginOverWindow(
    ADAPTIVE_SEAL_OVER_WINDOW,
    ADAPTIVE_PINCH_CLEARANCE,
  );
  const total = 2 * each;
  const top = total * ADAPTIVE_CARD_TOP_SHARE;
  return { top, bottom: total - top, total };
}

function insetPctFromAsymmetricVertical(
  topOverWindow: number,
  bottomOverWindow: number,
): { top: string; bottom: string } {
  const denom = 1 + topOverWindow + bottomOverWindow;
  return {
    top: pct(topOverWindow / denom),
    bottom: pct(bottomOverWindow / denom),
  };
}

/**
 * Outer W/H for a sealed bag around a face of the given aspect, so that
 * after {@link SEALED_CARD_INSET} the remaining window equals `faceAspect`.
 */
export function sealedAdaptiveOuterAspectRatio(
  faceAspect: number = TCG_FACE_ASPECT,
): number {
  const face = faceAspect > 0 ? faceAspect : TCG_FACE_ASPECT;
  const rim = marginOverWindow(ADAPTIVE_RIM_OVER_WINDOW);
  const { total: sealTotal } = adaptiveVerticalMarginsOverWindow();
  return (face * (1 + 2 * rim)) / (1 + sealTotal);
}

/** CSS `aspect-ratio` string for {@link sealedAdaptiveOuterAspectRatio}. */
export function sealedAdaptiveOuterAspect(
  faceAspect: number = TCG_FACE_ASPECT,
): string {
  const outer = sealedAdaptiveOuterAspectRatio(faceAspect);
  const h = 1000;
  const w = Math.round(outer * h);
  return `${w} / ${h}`;
}

function parseCssAspect(aspect: string | null | undefined): number | null {
  if (!aspect) return null;
  const match = aspect.trim().match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!(w > 0 && h > 0)) return null;
  return w / h;
}

/**
 * Outer frame aspect when the print is in a sealed bag; otherwise `null`
 * (caller keeps the shelf / TCG ratio).
 */
export function sealedBagOuterAspect(opts: {
  finish?: string | null;
  sealedBag?: boolean | null;
  /**
   * Face aspect as CSS `W / H` or W/H number. Defaults to TCG `5 / 7`.
   * Pass the oriented shelf face so landscape prints keep a matching window.
   */
  faceAspect?: string | number | null;
}): string | null {
  const wants =
    Boolean(opts.sealedBag) || isSealedFinish(opts.finish);
  if (!wants) return null;
  const face =
    typeof opts.faceAspect === "number"
      ? opts.faceAspect
      : (parseCssAspect(opts.faceAspect) ?? TCG_FACE_ASPECT);
  return sealedAdaptiveOuterAspect(face);
}

export type SealedCardInset = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

function pct(fraction: number): string {
  return `${Math.round(fraction * 10_000) / 100}%`;
}

/**
 * 9-slice chrome tracks (pinch / rim only — no extra clearance).
 * Slightly tighter than {@link SEALED_CARD_INSET} so a clear PE gutter
 * sits between the crimps and the print.
 */
export const SEALED_BAG_CHROME_INSET: SealedCardInset = {
  top: insetPctFromWindowMargin(ADAPTIVE_SEAL_OVER_WINDOW),
  right: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
  bottom: insetPctFromWindowMargin(ADAPTIVE_SEAL_OVER_WINDOW),
  left: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
};

/**
 * Card window as % of the *outer* box. Includes pinch clearance so the print
 * does not sit under the heat-seal bands; top share below 0.5 lifts the card
 * slightly toward the upper pinch.
 */
const _adaptiveVert = adaptiveVerticalMarginsOverWindow();
const _adaptiveVertInset = insetPctFromAsymmetricVertical(
  _adaptiveVert.top,
  _adaptiveVert.bottom,
);
export const SEALED_CARD_INSET: SealedCardInset = {
  top: _adaptiveVertInset.top,
  right: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
  bottom: _adaptiveVertInset.bottom,
  left: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
};

/** @deprecated Alias of {@link SEALED_CARD_INSET}. */
export const SEALED_CARD_INSET_ADAPTIVE = SEALED_CARD_INSET;

export function sealedCardInsetStyle(): SealedCardInset {
  return { ...SEALED_CARD_INSET };
}

/** Width/height of the face window after {@link sealedCardInsetStyle}. */
export function sealedCardWindowAspect(
  faceAspect: number = TCG_FACE_ASPECT,
): number {
  const inset = sealedCardInsetStyle();
  const read = (value: string) => Number.parseFloat(value) / 100;
  const innerW = 1 - read(inset.left) - read(inset.right);
  const innerH = 1 - read(inset.top) - read(inset.bottom);
  const outer = sealedAdaptiveOuterAspectRatio(faceAspect);
  return (innerW / innerH) * outer;
}

export function isSealedFinish(finish: string | null | undefined): boolean {
  const n = (finish ?? "").trim().toLowerCase();
  // Legacy playroom / storage ids still mean packaging-only.
  return (
    n === SEALED_FINISH ||
    n === "sealed-top" ||
    n === "sealed-both" ||
    n === "sealed-adaptive"
  );
}

/**
 * Playroom / material names that wrap the face in a sealed bag.
 * - `sealed` — packaging only
 * - `foil-sealed` / `*-sealed` — foil + bag demos
 */
export function materialWantsSealedBag(
  materialOrFinish: string | null | undefined,
): boolean {
  const n = (materialOrFinish ?? "").trim().toLowerCase();
  if (!n) return false;
  if (isSealedFinish(n)) return true;
  if (n === "foil-sealed") return true;
  if (n.endsWith("-sealed")) return true;
  if (n.endsWith("-adaptive") && n.includes("sealed")) return true;
  return false;
}

/** Master bag URL (crop source). Runtime chrome uses {@link SEALED_BAG_SLICES}. */
export function sealedBagBagUrl(): string {
  return SEALED_BAG_MASTER_URL;
}
