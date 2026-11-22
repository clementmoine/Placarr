/**
 * Lorcana CSS looks from dumpWeb `recipes.json` (publisher foil-inner rules).
 */

import { loadLorcanaWebRecipes } from "@/lib/foilMetaLoad";

import { isHoloShaderId, type HoloShaderId } from "./holoShaderIds";
import type { HoloShader } from "./holoShaders";

/** Second coats that sit above a finish (not expressed as one upstream rule). */
const OVERLAY_BY_FINISH: Readonly<Record<string, HoloShaderId>> = {
  lore: "loreShine",
  satin: "satinShine",
};

export function lorcanaWebLookIds(): ReadonlySet<string> {
  const looks = loadLorcanaWebRecipes().looks ?? {};
  return new Set(Object.keys(looks));
}

export function hasLorcanaWebLook(id: string): boolean {
  return Boolean(loadLorcanaWebRecipes().looks?.[id]);
}

/** Publisher CSS often concatenates filter funcs; space them for composition. */
function spacedCssFilter(filter: string): string {
  return filter
    .replace(/\)(?=[a-zA-Z])/g, ") ")
    .replace(/(^|[^\d.])\.(\d)/g, "$10.$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a HoloShader from the dumped look declaration.
 * Stamps `pointerFalloff: false` (full foil within the print mask).
 */
export function lorcanaWebHoloShader(id: string): HoloShader | null {
  const decl = loadLorcanaWebRecipes().looks?.[id];
  // A look present in recipes.json is a HoloShaderId (`isHoloShaderId`).
  if (!decl?.backgroundImage || !isHoloShaderId(id)) return null;
  return {
    id,
    backgroundImage: decl.backgroundImage,
    // A rule the publisher leaves unset falls back to the CSS initial value —
    // what the browser draws when the inline style omits it (no stylesheet
    // sets these on the foil layer). `satin` / `chromeRainbowHotFoil` ship no
    // background-repeat.
    backgroundRepeat: decl.backgroundRepeat || "repeat",
    backgroundSize: decl.backgroundSize || "auto",
    backgroundPosition: decl.backgroundPosition || "0% 0%",
    ...(decl.backgroundBlendMode
      ? { backgroundBlendMode: decl.backgroundBlendMode }
      : {}),
    mixBlendMode: decl.mixBlendMode || "normal",
    ...(decl.opacity != null ? { opacity: decl.opacity } : {}),
    ...(decl.filter ? { filter: spacedCssFilter(decl.filter) } : {}),
    ...(OVERLAY_BY_FINISH[id]
      ? { overlay: OVERLAY_BY_FINISH[id] }
      : {}),
    pointerFalloff: false,
  };
}
