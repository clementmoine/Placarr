/** Where transcribed CSS foil textures live for the Lorcana pack. */
export const WEB_TEXTURE_BASE = "/foil/lorcana/web";

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
  const finishShaderId = FINISH_CSS[finish] ?? null;
  const varnishShaderId =
    varnish && VARNISH_CSS[varnish] ? VARNISH_CSS[varnish] : null;
  return { finishShaderId, varnishShaderId };
}
