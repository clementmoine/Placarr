import type { EffectPackModule } from "@/core/render/foil/types";
import { registerEffectPack } from "@/core/render/foil/registry";

import { resolveCssRecipe } from "./cssRecipes";
import {
  lorcanaMaterial,
  lorcanaMaterialForPrint,
  listLorcanaMaterialNames,
} from "./manifest";
import {
  parseMaterialName,
  resolveMaterial,
  resolveMaterialName,
} from "./resolveMaterial";

export const LORCANA_EFFECT_PACK_ID = "lorcana";
export const LORCANA_CARD_BACK_URL = "/assets/lorcana/cards/back.webp";
/**
 * Opaque full-face foil plate — last-resort CSS coverage when an attested
 * Lorcast fill has no greyscale art facsimile yet.
 */
export const LORCANA_FULL_FOIL_MASK_URL =
  "/assets/lorcana/full_foil_mask.webp";

/** Solid full-face plate only — hand-authored `mask.attested.webp` drives WebGL. */
export function isLorcanaCssOnlyFoilMask(maskUrl: string): boolean {
  return maskUrl === LORCANA_FULL_FOIL_MASK_URL;
}

export { faceQuarterTurnsForLorcanaPrint } from "./faceOrientation";

/** CSS = site Lorcana ; WebGL = app TCG Unity — `docs/foil_effects.md`. */
export const lorcanaEffectPack: EffectPackModule = {
  id: LORCANA_EFFECT_PACK_ID,
  label: "Lorcana",
  blurb: "CSS site + WebGL app",
  assetBase: "/assets/lorcana",
  cardBackUrl: LORCANA_CARD_BACK_URL,
  fallbackFoilMaskUrl: LORCANA_FULL_FOIL_MASK_URL,
  isCssOnlyFoilMask: isLorcanaCssOnlyFoilMask,
  resolveMaterial: (finish, varnish) => resolveMaterial(finish, varnish),
  resolveMaterialForPrint: (finish, varnish, opts) => {
    const name = resolveMaterialName(finish, varnish);
    return name ? lorcanaMaterialForPrint(name, opts) : null;
  },
  resolveCss: (finish, varnish) => resolveCssRecipe(finish, varnish),
  listMaterials: () => listLorcanaMaterialNames(),
  material: (name) => lorcanaMaterial(name),
  materialForPrint: (name, opts) => lorcanaMaterialForPrint(name, opts),
  parseMaterialName,
};

registerEffectPack(lorcanaEffectPack);
