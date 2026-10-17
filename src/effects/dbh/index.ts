import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const DBH_EFFECT_PACK_ID = "dbs-heroes";

const ASSET_BASE = "/assets/dragonball/heroes";

export const dbhEffectPack = defineCatalogueOnlyPack({
  id: DBH_EFFECT_PACK_ID,
  label: "Dragon Ball Heroes",
  blurb: "Catalogue local Dragon Ball Heroes (carddass.com) — JA",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
