/**
 * Pack d'effets Naruto Data Carddass — catalogue only.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const NARUTO_DATA_CARDDASS_EFFECT_PACK_ID = "naruto-data-carddass";

const ASSET_BASE = "/assets/naruto/data-carddass";

export const narutoDataCarddassEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_DATA_CARDDASS_EFFECT_PACK_ID,
  label: "Naruto Data Carddass",
  blurb:
    "Catalogue local Data Carddass arcade — verso carte par carte (CODE128), sans dump foil",
  assetBase: ASSET_BASE,
  /*
    Contract URL only — no shared sleeve on disk. Real backs live under each
    print (`cards/{set}/ja/{n}/back.*`) and reach the flip via print scope.
  */
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
