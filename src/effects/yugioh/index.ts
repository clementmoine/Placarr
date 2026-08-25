/**
 * Pack d'effets Yu-Gi-Oh! — catalogue only, pas de dump foil.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const YUGIOH_EFFECT_PACK_ID = "yugioh";

const ASSET_BASE = "/assets/yugioh";

export const yugiohEffectPack = defineCatalogueOnlyPack({
  id: YUGIOH_EFFECT_PACK_ID,
  label: "Yu-Gi-Oh!",
  blurb: "Catalogue local Yu-Gi-Oh! — dos à curer, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
