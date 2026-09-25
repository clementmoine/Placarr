/**
 * Packs d'effets Leclerc — une ligne Marvel, une ligne Disney (catalogue only).
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const LECLERC_MARVEL_EFFECT_PACK_ID = "leclerc-marvel";
export const LECLERC_DISNEY_EFFECT_PACK_ID = "leclerc-disney";

/** @deprecated Use line-specific ids. */
export const LECLERC_EFFECT_PACK_ID = LECLERC_MARVEL_EFFECT_PACK_ID;

const MARVEL_ASSET_BASE = "/assets/leclerc/marvel";
const DISNEY_ASSET_BASE = "/assets/leclerc/disney";

export const leclercMarvelEffectPack = defineCatalogueOnlyPack({
  id: LECLERC_MARVEL_EFFECT_PACK_ID,
  label: "Leclerc Marvel",
  blurb: "Catalogue local opérations Marvel Leclerc — dos à curer, sans foil",
  assetBase: MARVEL_ASSET_BASE,
  cardBackUrl: `${MARVEL_ASSET_BASE}/cards/back.webp`,
});

export const leclercDisneyEffectPack = defineCatalogueOnlyPack({
  id: LECLERC_DISNEY_EFFECT_PACK_ID,
  label: "Leclerc Disney",
  blurb: "Catalogue local opération Disney Leclerc — dos à curer, sans foil",
  assetBase: DISNEY_ASSET_BASE,
  cardBackUrl: `${DISNEY_ASSET_BASE}/cards/back.webp`,
});

/** @deprecated Prefer leclercMarvelEffectPack. */
export const leclercEffectPack = leclercMarvelEffectPack;
