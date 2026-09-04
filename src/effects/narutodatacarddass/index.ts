/**
 * Pack d'effets Naruto Data Carddass — catalogue only.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const NARUTO_DATA_CARDDASS_EFFECT_PACK_ID = "naruto-data-carddass";

const ASSET_BASE = "/assets/naruto/data-carddass";

export const narutoDataCarddassEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_DATA_CARDDASS_EFFECT_PACK_ID,
  label: "Naruto Data Carddass",
  blurb: "Catalogue local Data Carddass arcade — dos à curer, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
