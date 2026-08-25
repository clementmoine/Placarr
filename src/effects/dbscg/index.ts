/**
 * DBS Masters effect pack — sleeve back, house foil, no dumped shaders.
 *
 * Bandai's cardlist does not publish a sleeve back. The pack back is the
 * Masters 7-ball verso from dbscards (`original/back.webp`), installed under
 * `data/dbs/cg/cards/back.webp`. There is no Unity / mask dump, so shiny
 * finishes use a house look on a full-face plate — same honesty as Naruto.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

export const DBS_CG_EFFECT_PACK_ID = "dbs-cg";

const ASSET_BASE = "/assets/dbs/cg";

export const DBS_CG_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

const FINISH_SHADER: Record<string, string> = {
  foil: "flare",
};

export const DBS_CG_FINISHES = Object.keys(FINISH_SHADER);

export const dbsCgEffectPack = defineCatalogueOnlyPack({
  id: DBS_CG_EFFECT_PACK_ID,
  label: "Dragon Ball Super Card Game",
  blurb: "Catalogue Bandai Masters — dos sleeve, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
  finishShader: FINISH_SHADER,
  fallbackFoilMaskUrl: DBS_CG_FULL_FOIL_MASK_URL,
});
