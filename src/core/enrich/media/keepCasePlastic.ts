/**
 * Keep-case polycarbonate tint for GameBox3D plastic edges.
 *
 * Distinctive shell colours (PS2 blue, Switch red, Wii U blue…) only when the
 * platform key is known — unknown / cardboard eras stay honest generic smoke.
 */

export type KeepCasePlasticRecipe = {
  /** Mid-tone CSS color for the polycarbonate shell. */
  base: string;
  /** Lighter rim / highlight stop. */
  highlight: string;
  /** Darker recess stop. */
  shade: string;
};

/** Translucent black / anthracite — modern Sony / default DVD-style. */
const SMOKE: KeepCasePlasticRecipe = {
  base: "oklch(0.22 0.01 260)",
  highlight: "oklch(0.32 0.012 260)",
  shade: "oklch(0.14 0.008 260)",
};

const RECIPES: Record<string, KeepCasePlasticRecipe> = {
  // Sony
  ps1: {
    base: "oklch(0.18 0.01 260)",
    highlight: "oklch(0.28 0.012 260)",
    shade: "oklch(0.1 0.008 260)",
  },
  ps2: {
    base: "oklch(0.38 0.14 255)",
    highlight: "oklch(0.48 0.16 255)",
    shade: "oklch(0.24 0.12 255)",
  },
  ps3: SMOKE,
  ps4: {
    base: "oklch(0.2 0.03 250)",
    highlight: "oklch(0.3 0.04 250)",
    shade: "oklch(0.12 0.02 250)",
  },
  ps5: {
    base: "oklch(0.2 0.035 250)",
    highlight: "oklch(0.3 0.045 250)",
    shade: "oklch(0.12 0.025 250)",
  },
  psp: SMOKE,
  psvita: SMOKE,

  // Microsoft — green-tinted translucent
  xbox: {
    base: "oklch(0.32 0.12 145)",
    highlight: "oklch(0.42 0.14 145)",
    shade: "oklch(0.2 0.1 145)",
  },
  xbox360: {
    base: "oklch(0.55 0.02 100)",
    highlight: "oklch(0.7 0.025 100)",
    shade: "oklch(0.38 0.015 100)",
  },
  xboxone: {
    base: "oklch(0.28 0.08 145)",
    highlight: "oklch(0.38 0.1 145)",
    shade: "oklch(0.16 0.06 145)",
  },
  xboxseries: {
    base: "oklch(0.26 0.09 145)",
    highlight: "oklch(0.36 0.11 145)",
    shade: "oklch(0.15 0.07 145)",
  },

  // Nintendo optical keep-cases
  gamecube: SMOKE,
  wii: {
    base: "oklch(0.78 0.02 250)",
    highlight: "oklch(0.9 0.015 250)",
    shade: "oklch(0.58 0.025 250)",
  },
  wiiu: {
    base: "oklch(0.42 0.12 250)",
    highlight: "oklch(0.55 0.14 250)",
    shade: "oklch(0.28 0.1 250)",
  },
  switch: {
    base: "oklch(0.42 0.18 25)",
    highlight: "oklch(0.52 0.2 25)",
    shade: "oklch(0.28 0.15 25)",
  },
  switch2: {
    base: "oklch(0.38 0.16 25)",
    highlight: "oklch(0.48 0.18 25)",
    shade: "oklch(0.24 0.13 25)",
  },
  ds: {
    base: "oklch(0.72 0.015 250)",
    highlight: "oklch(0.85 0.012 250)",
    shade: "oklch(0.52 0.02 250)",
  },
  "3ds": {
    base: "oklch(0.2 0.015 260)",
    highlight: "oklch(0.3 0.02 260)",
    shade: "oklch(0.12 0.01 260)",
  },

  // Sega
  dreamcast: {
    base: "oklch(0.72 0.06 70)",
    highlight: "oklch(0.85 0.05 70)",
    shade: "oklch(0.5 0.07 55)",
  },
  saturn: {
    base: "oklch(0.35 0.02 260)",
    highlight: "oklch(0.48 0.025 260)",
    shade: "oklch(0.22 0.015 260)",
  },
};

/**
 * Plastic shell recipe for a video-game platform key.
 * Unknown / cardboard-era platforms → generic smoke (never a guessed brand hue).
 */
export function keepCasePlasticRecipe(
  platformKey?: string | null,
): KeepCasePlasticRecipe {
  const key = (platformKey || "").toLowerCase().trim();
  if (!key) return SMOKE;
  return RECIPES[key] ?? SMOKE;
}
