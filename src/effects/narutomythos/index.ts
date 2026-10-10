/**
 * Pack d'effets Naruto Mythos TCG (CICABOOM) — catalogue only, pas de dump foil.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const NARUTO_MYTHOS_EFFECT_PACK_ID = "naruto-mythos";

const ASSET_BASE = "/assets/naruto/mythos";

export const narutoMythosEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_MYTHOS_EFFECT_PACK_ID,
  label: "Naruto Mythos",
  blurb: "Catalogue local Mythos — dos attesté LorenZone / CICABOOM, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
