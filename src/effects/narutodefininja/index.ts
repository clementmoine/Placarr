/**
 * Pack d'effets Naruto Défi Ninja (404 Éditions) — catalogue only.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const NARUTO_DEFI_NINJA_EFFECT_PACK_ID = "naruto-defi-ninja";

const ASSET_BASE = "/assets/naruto/defi-ninja";

export const narutoDefiNinjaEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_DEFI_NINJA_EFFECT_PACK_ID,
  label: "Naruto Défi Ninja",
  blurb: "Catalogue local Défi Ninja — dos à curer, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
