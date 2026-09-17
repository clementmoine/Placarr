import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const BLEACH_SCB_EFFECT_PACK_ID = "bleach-scb";

const ASSET_BASE = "/assets/bleach/scb";

export const bleachScbEffectPack = defineCatalogueOnlyPack({
  id: BLEACH_SCB_EFFECT_PACK_ID,
  label: "Bleach Soul Card Battle",
  blurb: "Catalogue local Bleach Soul Card Battle (Carddass) — ja/fr/en",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
});
