/**
 * Pack d'effets Dragon Ball JCC (Bandai France) — catalogue only, pas de dump foil.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const DBS_JCC_EFFECT_PACK_ID = "dbs-jcc";

const ASSET_BASE = "/assets/dragonball/jcc";

export const dbsJccEffectPack = defineCatalogueOnlyPack({
  id: DBS_JCC_EFFECT_PACK_ID,
  label: "Dragon Ball JCC",
  blurb:
    "Catalogue local Dragon Ball Carddass / JCC (Bandai) — facettes ja/fr/en",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
