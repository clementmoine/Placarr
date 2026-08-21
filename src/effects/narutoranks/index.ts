/**
 * Pack d'effets de Naruto Ninja Ranks.
 *
 * Il existe pour le **dos** : ce n'est pas le triskèle Carddass, ni le losange
 * 疾風伝. Le verso n'est pas encore curé — l'URL est le contrat, le fichier
 * viendra avec une source.
 */
import { registerEffectPack } from "@/core/render/foil/registry";
import type { EffectPackModule } from "@/core/render/foil/types";

export const NARUTO_RANKS_EFFECT_PACK_ID = "naruto-ninja-ranks";

const ASSET_BASE = "/assets/naruto/ninja-ranks";

export const narutoRanksEffectPack: EffectPackModule = {
  id: NARUTO_RANKS_EFFECT_PACK_ID,
  label: "Naruto Ninja Ranks",
  blurb: "Catalogue local — dos du jeu, sans effet foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.fr.webp`,
  resolveMaterial: () => null,
  resolveMaterialForPrint: () => null,
  resolveCss: () => ({ finishShaderId: null, varnishShaderId: null }),
  listMaterials: () => [],
  material: () => null,
};

registerEffectPack(narutoRanksEffectPack);
