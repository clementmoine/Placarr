/**
 * Pack d'effets de Naruto Ultra Challenge (Panini lamincards, 2007).
 *
 * Autre dos que le Carddass : Vintage rangeait cette ligne sous « French »
 * précisément parce que ce n'était pas du Bandai NI/TE/TA. Verso pas encore
 * curé — l'URL est le contrat.
 */
import { registerEffectPack } from "@/core/render/foil/registry";
import type { EffectPackModule } from "@/core/render/foil/types";

export const NARUTO_ULTRA_EFFECT_PACK_ID = "naruto-ultra-challenge";

const ASSET_BASE = "/assets/naruto/ultra-challenge";

export const narutoUltraEffectPack: EffectPackModule = {
  id: NARUTO_ULTRA_EFFECT_PACK_ID,
  label: "Naruto Ultra Challenge",
  blurb: "Catalogue local — dos du jeu, sans effet foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.fr.webp`,
  resolveMaterial: () => null,
  resolveMaterialForPrint: () => null,
  resolveCss: () => ({ finishShaderId: null, varnishShaderId: null }),
  listMaterials: () => [],
  material: () => null,
};

registerEffectPack(narutoUltraEffectPack);
