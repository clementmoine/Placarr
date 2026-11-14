import type { Lean } from "@/core/render/deviceTilt";

/**
 * Pointer → CSS custom properties for foil layers.
 *
 * From simeydotme/pokemon-cards-151 (GPL-3.0, adapted under Placarr’s GPL):
 * glare follows the raw pointer (`--colorX/Y` / `--pointer-x/y`), while motif
 * travel uses a *compressed* `--background-x/y` so oversized backgrounds never
 * walk their box edge onto the card. Ranges match their `adjust(…, 37, 63)` /
 * `adjust(…, 33, 67)`.
 */

/** Map `value` from `[fromMin, fromMax]` into `[toMin, toMax]`. */
export function adjust(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
): number {
  if (fromMax === fromMin) return toMin;
  const t = (value - fromMin) / (fromMax - fromMin);
  return toMin + t * (toMax - toMin);
}

/** Motif scroll X — compressed so 0–100% pointer → ~37–63%. */
export const BACKGROUND_X_RANGE = [37, 63] as const;
/** Motif scroll Y — compressed so 0–100% pointer → ~33–67%. */
export const BACKGROUND_Y_RANGE = [33, 67] as const;

export function compressBackgroundX(lightX: number): number {
  return adjust(lightX, 0, 100, BACKGROUND_X_RANGE[0], BACKGROUND_X_RANGE[1]);
}

export function compressBackgroundY(lightY: number): number {
  return adjust(lightY, 0, 100, BACKGROUND_Y_RANGE[0], BACKGROUND_Y_RANGE[1]);
}

export type FoilPointerCssVars = {
  colorX: number;
  colorY: number;
  backgroundX: number;
  backgroundY: number;
  combined: number;
  opacity: number;
  rotateX: number;
  rotateY: number;
  pointerFromCenter: number;
  pointerFromTop: number;
  pointerFromLeft: number;
};

/**
 * `pointer` / `idle` share the same mapping: lean drives spotlight + motif,
 * caller sets glare dose (idle soft band ≈0.12–0.30, pointer ≈0.66).
 * The mode flag stays for call-site clarity; behaviour no longer forks.
 */
export type FoilPointerCssMode = "pointer" | "idle";

/**
 * Resolve the full set of foil pointer vars from a lean (+ optional idle
 * `--combined` that is not `lightX + lightY`).
 */
export function foilPointerVars(
  lean: Lean,
  glare: number,
  combined?: number,
  _mode: FoilPointerCssMode = "pointer",
): FoilPointerCssVars {
  const motifX = lean.lightX;
  const motifY = lean.lightY;
  const glareX = motifX;
  const glareY = motifY;
  const dx = (glareX - 50) / 50;
  const dy = (glareY - 50) / 50;
  const fromCenter = Math.min(1, Math.hypot(dx, dy) / Math.SQRT2);
  return {
    colorX: glareX,
    colorY: glareY,
    backgroundX: compressBackgroundX(motifX),
    backgroundY: compressBackgroundY(motifY),
    combined: combined ?? motifX + motifY,
    opacity: glare,
    // CSS vars are crossed to match the transform
    // `rotateX(var(--rotateY)) rotateY(var(--rotateX))` — same as place().
    rotateX: lean.tiltY,
    rotateY: lean.tiltX,
    pointerFromCenter: fromCenter,
    pointerFromTop: glareY / 100,
    pointerFromLeft: glareX / 100,
  };
}

/** Write {@link foilPointerVars} onto a frame element (idle / pointer path). */
export function applyFoilPointerCss(
  frame: HTMLElement,
  lean: Lean,
  glare: number,
  combined?: number,
  mode: FoilPointerCssMode = "pointer",
): void {
  const v = foilPointerVars(lean, glare, combined, mode);
  frame.style.setProperty("--colorX", `${v.colorX}%`);
  frame.style.setProperty("--colorY", `${v.colorY}%`);
  // Aliases used by vendored simey recipes (radiant-holo.css, …).
  frame.style.setProperty("--pointer-x", `${v.colorX}%`);
  frame.style.setProperty("--pointer-y", `${v.colorY}%`);
  frame.style.setProperty("--background-x", `${v.backgroundX}%`);
  frame.style.setProperty("--background-y", `${v.backgroundY}%`);
  frame.style.setProperty("--combined", `${v.combined}%`);
  frame.style.setProperty("--rotateX", `${v.rotateX}deg`);
  frame.style.setProperty("--rotateY", `${v.rotateY}deg`);
  frame.style.setProperty("--opacity", `${v.opacity}`);
  // Radiant spotlight falloff (simey `base.css` default — not a hot gold).
  if (!frame.style.getPropertyValue("--card-glow")) {
    frame.style.setProperty("--card-glow", "hsl(175, 100%, 90%)");
  }
  frame.style.setProperty(
    "--pointer-from-center",
    `${v.pointerFromCenter.toFixed(4)}`,
  );
  frame.style.setProperty(
    "--pointer-from-top",
    `${v.pointerFromTop.toFixed(4)}`,
  );
  frame.style.setProperty(
    "--pointer-from-left",
    `${v.pointerFromLeft.toFixed(4)}`,
  );
}
