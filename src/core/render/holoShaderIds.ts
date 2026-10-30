/**
 * CSS look id membership — **client-safe**, no texture recipe bodies.
 *
 * Baseline ids stay listed here for shelf tiles (Unity leaf vs CSS id).
 * Dump-discovered Lorcana looks (new publisher finishes) also count once
 * `recipes.json` is hydrated via foilMetaLoad.
 */

import { loadLorcanaWebRecipes } from "@/lib/foilMetaLoad";

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
  "tinsel",
  "tempest",
  "calendarWave",
  "loreShine",
  "satinShine",
  "hotFoil",
  "chromeRainbowHotFoil",
] as const;

export type HoloShaderId = (typeof HOLO_SHADER_IDS)[number];

export function isHoloShaderId(value: unknown): value is HoloShaderId {
  if (typeof value !== "string") return false;
  if ((HOLO_SHADER_IDS as readonly string[]).includes(value)) return true;
  return Boolean(loadLorcanaWebRecipes().looks?.[value]);
}
