/**
 * Pack d'effets Digimon Card Game — catalogue only, pas de dump foil.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const DIGIMON_EFFECT_PACK_ID = "digimon";

const ASSET_BASE = "/assets/digimon";

export const digimonEffectPack = defineCatalogueOnlyPack({
  id: DIGIMON_EFFECT_PACK_ID,
  label: "Digimon Card Game",
  blurb: "Catalogue local Digimon — dos à curer, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
