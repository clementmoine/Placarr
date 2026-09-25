/**
 * Pack d'effets Magic: The Gathering — catalogue only, pas de dump foil.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const MTG_EFFECT_PACK_ID = "mtg";

const ASSET_BASE = "/assets/mtg";

export const mtgEffectPack = defineCatalogueOnlyPack({
  id: MTG_EFFECT_PACK_ID,
  label: "Magic: The Gathering",
  blurb: "Catalogue Scryfall — dos classique, faces CDN, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
