/**
 * Pack d'effets de Naruto Ultra Challenge (Panini lamincards, 2007).
 *
 * Autre dos que le Carddass : Vintage rangeait cette ligne sous « French »
 * précisément parce que ce n'était pas du Bandai NI/TE/TA. Verso pas encore
 * curé — l'URL est le contrat.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const NARUTO_ULTRA_EFFECT_PACK_ID = "naruto-ultra-challenge";

const ASSET_BASE = "/assets/naruto/ultra-challenge";

export const narutoUltraEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_ULTRA_EFFECT_PACK_ID,
  label: "Naruto Ultra Challenge",
  blurb: "Catalogue local — dos du jeu, sans effet foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.fr.webp`,
});
