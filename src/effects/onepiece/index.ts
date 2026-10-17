/**
 * Pack d'effets One Piece Card Game — catalogue only, pas de dump foil.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const ONEPIECE_EFFECT_PACK_ID = "onepiece";

const ASSET_BASE = "/assets/onepiece";

export const onepieceEffectPack = defineCatalogueOnlyPack({
  id: ONEPIECE_EFFECT_PACK_ID,
  label: "One Piece Card Game",
  blurb: "Catalogue local OPTCG — dos à curer, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
