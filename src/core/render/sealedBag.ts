/**
 * Cross-TCG sealed-bag packaging overlay (double-pinch PE).
 *
 * Front: bag face. Back: horizontally mirrored bag + centered peel strip.
 * Assets live under `public/assets/shared/packaging/` (clear PE, magenta keyed).
 *
 * Two runtime variants:
 * - `adaptive` (default on shelves) — 9-slice; outer box = card aspect + thin
 *   seal/rim margins so the inner window matches the print exactly
 * - `full` — single full-bleed PNG in the native bag frame `29 / 46` (playroom A/B)
 *
 * The card art must sit **inside** the bag window ({@link sealedCardInsetStyle}),
 * not full-bleed under a flat overlay — otherwise it reads as a sticker on plastic.
 */

export const SEALED_FINISH = "sealed";

const PACKAGING_BASE = "/assets/shared/packaging";
const SLICES_BASE = `${PACKAGING_BASE}/slices`;

export const SEALED_BAG_URL = `${PACKAGING_BASE}/card-bag-seal-both.png`;
export const SEALED_BAG_PEEL_STRIP_URL = `${PACKAGING_BASE}/card-bag-peel-strip.png`;

/** @deprecated Use {@link SEALED_BAG_URL}. */
export const SEALED_BAG_SEAL_BOTH_URL = SEALED_BAG_URL;

/**
 * Native packaging PNG size (1682×2668). Used by the full-bleed variant and as
 * the master for 9-slice crops.
 */
export const SEALED_BAG_PIXEL_SIZE = { width: 1682, height: 2668 } as const;
/** CSS aspect-ratio for {@link SEALED_BAG_PIXEL_SIZE} (gcd-simplified). */
export const SEALED_BAG_ASPECT_RATIO = "29 / 46";

/**
 * 9-slice crops from {@link SEALED_BAG_URL} (master 1682×2668).
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

export type SealedBagVariant = "full" | "adaptive";

/**
 * Bag chrome variant from a playroom material name.
 * Default is **adaptive** (same as shelves / fiche). Opt into the legacy
 * full-bleed PNG with an explicit `*-full` suffix for A/B.
 */
export function sealedBagVariantFromMaterial(
  materialOrFinish: string | null | undefined,
): SealedBagVariant {
  const n = (materialOrFinish ?? "").trim().toLowerCase();
  if (!n) return "adaptive";
  if (n.endsWith("-full")) return "full";
  return "adaptive";
}

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
 * Outer W/H for an adaptive bag around a face of the given aspect, so that
 * after {@link SEALED_CARD_INSET_ADAPTIVE} the remaining window equals `faceAspect`.
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
  // Keep a stable, readable ratio (3 decimals → ints).
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
 *
 * - `adaptive` → card aspect expanded by thin seal/rim margins (window = card)
 * - `full` → native bag {@link SEALED_BAG_ASPECT_RATIO}
 * - `cardFrame: true` → `null` (playroom pads a card box in px)
 */
export function sealedBagOuterAspect(opts: {
  finish?: string | null;
  sealedBag?: boolean | null;
  variant?: SealedBagVariant | null;
  /** Adaptive + card-sized content box (playroom padding outside seals). */
  cardFrame?: boolean | null;
  /**
   * Face aspect as CSS `W / H` or W/H number. Defaults to TCG `5 / 7`.
   * Pass the oriented shelf face so landscape prints keep a matching window.
   */
  faceAspect?: string | number | null;
}): string | null {
  const wants =
    Boolean(opts.sealedBag) || isSealedFinish(opts.finish);
  if (!wants) return null;
  const variant = opts.variant ?? "adaptive";
  if (variant === "adaptive" && opts.cardFrame) return null;
  if (variant === "full") return SEALED_BAG_ASPECT_RATIO;
  const face =
    typeof opts.faceAspect === "number"
      ? opts.faceAspect
      : (parseCssAspect(opts.faceAspect) ?? TCG_FACE_ASPECT);
  return sealedAdaptiveOuterAspect(face);
}

/**
 * CSS padding (px @ display scale) so a card-aspect frame leaves room for
 * adaptive seals without clipping. Default scale `0.5` ≈ master @50 %.
 */
export function sealedAdaptiveFramePadding(displayScale = 0.5): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const rim = Math.max(1, Math.round(SEALED_BAG_SLICES.rimW * displayScale));
  const seal = Math.max(
    1,
    Math.round(
      SEALED_BAG_SLICES.windowH *
        marginOverWindow(ADAPTIVE_SEAL_OVER_WINDOW, ADAPTIVE_PINCH_CLEARANCE) *
        displayScale,
    ),
  );
  return { top: seal, right: rim, bottom: seal, left: rim };
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
 * Side rims + vertical clearance so the remaining window is TCG `5 / 7` inside
 * the taller full-bleed bag frame ({@link SEALED_BAG_ASPECT_RATIO}).
 */
function sealedCardInsetForSide(
  sideFrac: number,
  topShare: number,
): SealedCardInset {
  const bagAspect =
    SEALED_BAG_PIXEL_SIZE.width / SEALED_BAG_PIXEL_SIZE.height;
  const innerW = 1 - 2 * sideFrac;
  const innerH = (innerW * bagAspect) / TCG_FACE_ASPECT;
  const vert = Math.max(0, 1 - innerH);
  const top = vert * topShare;
  const bottom = vert - top;
  return {
    top: pct(top),
    right: pct(sideFrac),
    bottom: pct(bottom),
    left: pct(sideFrac),
  };
}

/** Full-bleed bag — ~12% side rims, seals split so the window stays 5:7. */
export const SEALED_CARD_INSET: SealedCardInset = sealedCardInsetForSide(
  0.12,
  0.5,
);

/**
 * 9-slice chrome tracks (pinch / rim only — no extra clearance).
 * Slightly tighter than {@link SEALED_CARD_INSET_ADAPTIVE} so a clear PE gutter
 * sits between the crimps and the print.
 */
export const SEALED_BAG_CHROME_INSET: SealedCardInset = {
  top: insetPctFromWindowMargin(ADAPTIVE_SEAL_OVER_WINDOW),
  right: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
  bottom: insetPctFromWindowMargin(ADAPTIVE_SEAL_OVER_WINDOW),
  left: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
};

/**
 * Adaptive card window as % of the *outer* box. Includes pinch clearance so
 * the print does not sit under the heat-seal bands; top share below 0.5 lifts
 * the card slightly toward the upper pinch.
 */
const _adaptiveVert = adaptiveVerticalMarginsOverWindow();
const _adaptiveVertInset = insetPctFromAsymmetricVertical(
  _adaptiveVert.top,
  _adaptiveVert.bottom,
);
export const SEALED_CARD_INSET_ADAPTIVE: SealedCardInset = {
  top: _adaptiveVertInset.top,
  right: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
  bottom: _adaptiveVertInset.bottom,
  left: insetPctFromWindowMargin(ADAPTIVE_RIM_OVER_WINDOW),
};

export function sealedCardInsetStyle(
  variant: SealedBagVariant = "adaptive",
): SealedCardInset {
  if (variant === "adaptive") return { ...SEALED_CARD_INSET_ADAPTIVE };
  return { ...SEALED_CARD_INSET };
}

/** Width/height of the face window after {@link sealedCardInsetStyle}. */
export function sealedCardWindowAspect(
  variant: SealedBagVariant = "adaptive",
  faceAspect: number = TCG_FACE_ASPECT,
): number {
  if (variant === "adaptive") {
    const inset = sealedCardInsetStyle("adaptive");
    const read = (value: string) => Number.parseFloat(value) / 100;
    const innerW = 1 - read(inset.left) - read(inset.right);
    const innerH = 1 - read(inset.top) - read(inset.bottom);
    const outer = sealedAdaptiveOuterAspectRatio(faceAspect);
    return (innerW / innerH) * outer;
  }
  const inset = sealedCardInsetStyle("full");
  const read = (value: string) => Number.parseFloat(value) / 100;
  const innerW = 1 - read(inset.left) - read(inset.right);
  const innerH = 1 - read(inset.top) - read(inset.bottom);
  const bagAspect =
    SEALED_BAG_PIXEL_SIZE.width / SEALED_BAG_PIXEL_SIZE.height;
  return (innerW / innerH) * bagAspect;
}

export function isSealedFinish(finish: string | null | undefined): boolean {
  const n = (finish ?? "").trim().toLowerCase();
  // Legacy playroom / storage ids still mean packaging-only.
  return (
    n === SEALED_FINISH ||
    n === "sealed-top" ||
    n === "sealed-both" ||
    n === "sealed-adaptive" ||
    n === "sealed-full"
  );
}

/**
 * Playroom / material names that wrap the face in a sealed bag.
 * - `sealed` / `sealed-adaptive` — packaging only
 * - `foil-sealed` / `foil-sealed-adaptive` / `*-sealed` — foil + bag demos
 */
export function materialWantsSealedBag(
  materialOrFinish: string | null | undefined,
): boolean {
  const n = (materialOrFinish ?? "").trim().toLowerCase();
  if (!n) return false;
  if (isSealedFinish(n)) return true;
  if (
    n === "foil-sealed" ||
    n === "foil-sealed-adaptive" ||
    n === "foil-sealed-full"
  ) {
    return true;
  }
  if (
    n.endsWith("-sealed") ||
    n.endsWith("-sealed-adaptive") ||
    n.endsWith("-sealed-full")
  ) {
    return true;
  }
  if (n.endsWith("-adaptive") && n.includes("sealed")) return true;
  return false;
}

export function sealedBagBagUrl(): string {
  return SEALED_BAG_URL;
}
