import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const NARUTO_CARDGAME_EFFECT_PACK_ID = "naruto-cardgame";

const ASSET_BASE = "/assets/naruto/cardgame";

export const narutoCardgameEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_CARDGAME_EFFECT_PACK_ID,
  label: "Naruto Card Game",
  blurb:
    "Catalogue local Naruto Card Game (Bandai Card Games, lancement 2027) — fr/en",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/backs/en`,
});
