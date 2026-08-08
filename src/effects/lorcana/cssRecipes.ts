/**
 * Lorcana web CSS recipes — pack-specific defaults live here, not in core.
 *
 * Unknown foil finishes fall back to silver (same as the old core default).
 * Unknown varnish types fall back to hotFoil. Packs without a web source
 * (Pokémon) return nulls from `resolveCss` and never inherit these.
 */

/** Where transcribed CSS foil textures live for this pack. */
export const WEB_TEXTURE_BASE = "/foil/lorcana/web";

/** Everyday foil when the catalogue finish has no dedicated CSS look. */
export const DEFAULT_FINISH_CSS_ID = "silver";

/** Stamped coat when the varnish type has no dedicated CSS look. */
export const DEFAULT_VARNISH_CSS_ID = "hotFoil";

export const FINISH_CSS: Readonly<Record<string, string>> = {
  Silver: "silver",
  Satin: "satin",
  Lore: "lore",
  Lava: "lava",
  Magma: "magma",
  Glitter: "glitter",
  VerticalWave: "verticalWave",
  VertWave: "verticalWave",
  SeaWave: "seaWave",
  RainbowPillars: "rainbowPillars",
  FreeForm1: "freeForm",
  FreeForm2: "freeForm",
  Tempest: "tempest",
  CalendarWave: "calendarWave",
};

export const VARNISH_CSS: Readonly<Record<string, string>> = {
  HighGloss: "hotFoil",
  MatteHotFoil: "hotFoil",
  MetallicHotFoil: "hotFoil",
  SnowHotFoil: "hotFoil",
  RainbowHotFoil: "hotFoil",
  ChromeRainbowHotFoil: "chromeRainbowHotFoil",
};

export function resolveCssRecipe(
  finish: string,
  varnish: string | null | undefined,
): { finishShaderId: string | null; varnishShaderId: string | null } {
  const trimmed = finish.trim();
  const finishShaderId = trimmed
    ? (FINISH_CSS[trimmed] ?? DEFAULT_FINISH_CSS_ID)
    : null;
  const varnishShaderId = varnish
    ? (VARNISH_CSS[varnish] ?? DEFAULT_VARNISH_CSS_ID)
    : null;
  return { finishShaderId, varnishShaderId };
}
