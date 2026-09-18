/**
 * Pack d'effets Dragon Ball Lamincards — catalogue only, pas de dump foil.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const DBS_LAMINCARDS_EFFECT_PACK_ID = "dbs-lamincards";

const ASSET_BASE = "/assets/dbs/lamincards";

export const dbsLamincardsEffectPack = defineCatalogueOnlyPack({
  id: DBS_LAMINCARDS_EFFECT_PACK_ID,
  label: "Dragon Ball Lamincards",
  blurb: "Catalogue local Edibas Lamincards — dos à curer, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
