/**
 * Packs d'effets Leclerc — Marvel / Disney / Star Wars (catalogue only).
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const LECLERC_MARVEL_EFFECT_PACK_ID = "leclerc-marvel";
export const LECLERC_DISNEY_EFFECT_PACK_ID = "leclerc-disney";
export const LECLERC_STARWARS_EFFECT_PACK_ID = "leclerc-starwars";

/** @deprecated Use line-specific ids. */
export const LECLERC_EFFECT_PACK_ID = LECLERC_MARVEL_EFFECT_PACK_ID;

const MARVEL_ASSET_BASE = "/assets/leclerc/marvel";
const DISNEY_ASSET_BASE = "/assets/leclerc/disney";
const STARWARS_ASSET_BASE = "/assets/leclerc/starwars";

export const leclercMarvelEffectPack = defineCatalogueOnlyPack({
  id: LECLERC_MARVEL_EFFECT_PACK_ID,
  label: "Leclerc Marvel",
  blurb: "Catalogue local opérations Marvel Leclerc — dos à curer, sans foil",
  assetBase: MARVEL_ASSET_BASE,
  cardBackUrl: `${MARVEL_ASSET_BASE}/backs/en`,
});

export const leclercDisneyEffectPack = defineCatalogueOnlyPack({
  id: LECLERC_DISNEY_EFFECT_PACK_ID,
  label: "Leclerc Disney",
  blurb: "Catalogue local opération Disney Leclerc — dos à curer, sans foil",
  assetBase: DISNEY_ASSET_BASE,
  cardBackUrl: `${DISNEY_ASSET_BASE}/backs/en`,
});

export const leclercStarWarsEffectPack = defineCatalogueOnlyPack({
  id: LECLERC_STARWARS_EFFECT_PACK_ID,
  label: "Leclerc Star Wars",
  blurb: "Catalogue local opérations Star Wars Leclerc — dos à curer, sans foil",
  assetBase: STARWARS_ASSET_BASE,
  cardBackUrl: `${STARWARS_ASSET_BASE}/backs/en`,
});

/** @deprecated Prefer leclercMarvelEffectPack. */
export const leclercEffectPack = leclercMarvelEffectPack;
