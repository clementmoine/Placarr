/**
 * Pack d'effets Naruto Data Carddass — catalogue only.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";
import { resolveDataCarddassCardBack } from "@/providers/naruto/narutodatacarddass/cardBack";

export const NARUTO_DATA_CARDDASS_EFFECT_PACK_ID = "naruto-data-carddass";

const ASSET_BASE = "/assets/naruto/data-carddass";

export const narutoDataCarddassEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_DATA_CARDDASS_EFFECT_PACK_ID,
  label: "Naruto Data Carddass",
  blurb:
    "Catalogue local Data Carddass arcade — dos numéroté (CODE128) ; per-print quand curé",
  assetBase: ASSET_BASE,
  /*
    Pack sleeve = numbered representative back (Amazon DN/NM scans). Prefer
    per-print `back.*` when present; else set sleeve DN/NM; else this default.
  */
  cardBackUrl: `${ASSET_BASE}/backs/ja`,
  resolveCardBack: resolveDataCarddassCardBack,
});
