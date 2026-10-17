/**
 * CSS look id membership — **client-safe**, no texture recipes.
 *
 * Full look tables live in `holoShaders.ts` (+ Pokemon / Simey / house). Shelf
 * tiles only need to know whether a `finishShaders` value is a CSS id vs a
 * Unity material leaf; resolving the look happens inside FoilCardImage.
 */

export const HOLO_SHADER_IDS = [
  "silver",
  "satin",
  "lore",
  "lava",
  "magma",
  "glitter",
  "verticalWave",
  "seaWave",
  "rainbowPillars",
  "freeForm",
  "tempest",
  "calendarWave",
  "loreShine",
  "satinShine",
  "hotFoil",
  "chromeRainbowHotFoil",
] as const;

export type HoloShaderId = (typeof HOLO_SHADER_IDS)[number];

export function isHoloShaderId(value: unknown): value is HoloShaderId {
  return (
    typeof value === "string" &&
    (HOLO_SHADER_IDS as readonly string[]).includes(value)
  );
}
