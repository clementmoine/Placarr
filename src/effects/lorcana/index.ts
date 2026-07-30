import type { EffectPackModule } from "@/core/render/foil/types";
import { registerEffectPack } from "@/core/render/foil/registry";

import { resolveCssRecipe } from "./cssRecipes";
import {
  lorcanaMaterial,
  lorcanaMaterialForPrint,
  LORCANA_MATERIAL_NAMES,
} from "./manifest";
import {
  parseMaterialName,
  resolveMaterial,
  resolveMaterialName,
} from "./resolveMaterial";

export const LORCANA_EFFECT_PACK_ID = "lorcana";
export const LORCANA_CARD_BACK_URL = "/foil/lorcana/card_back.png";

export const lorcanaEffectPack: EffectPackModule = {
  id: LORCANA_EFFECT_PACK_ID,
  assetBase: "/foil/lorcana",
  cardBackUrl: LORCANA_CARD_BACK_URL,
  resolveMaterial: (finish, varnish) => resolveMaterial(finish, varnish),
  resolveMaterialForPrint: (finish, varnish, opts) => {
    const name = resolveMaterialName(finish, varnish);
    return name ? lorcanaMaterialForPrint(name, opts) : null;
  },
  resolveCss: (finish, varnish) => resolveCssRecipe(finish, varnish),
  listMaterials: () => LORCANA_MATERIAL_NAMES,
  material: (name) => lorcanaMaterial(name),
  materialForPrint: (name, opts) => lorcanaMaterialForPrint(name, opts),
  parseMaterialName,
};

registerEffectPack(lorcanaEffectPack);
