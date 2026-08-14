/**
 * Fusion World effect pack — sleeve back placeholder, house foil, no shaders.
 *
 * Bandai does not publish a sleeve back. Until a verified FW verso exists, the
 * pack back is the same dbscards Masters 7-ball image (see curated/BACK.md).
 */
import { registerEffectPack } from "@/core/render/foil/registry";
import type { EffectPackModule } from "@/core/render/foil/types";

export const DBS_FW_EFFECT_PACK_ID = "dbs-fw";

const ASSET_BASE = "/assets/dbs/fw";

export const DBS_FW_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

const FINISH_SHADER: Record<string, string> = {
  foil: "flare",
};

export const DBS_FW_FINISHES = Object.keys(FINISH_SHADER);

export const dbsFwEffectPack: EffectPackModule = {
  id: DBS_FW_EFFECT_PACK_ID,
  label: "Dragon Ball Super Card Game Fusion World",
  blurb: "Catalogue Bandai Fusion World — dos placeholder, sans dump foil",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
  resolveMaterial: () => null,
  resolveMaterialForPrint: () => null,
  fallbackFoilMaskUrl: DBS_FW_FULL_FOIL_MASK_URL,
  resolveCss: (finish) => ({
    finishShaderId: FINISH_SHADER[(finish ?? "").toLowerCase()] ?? null,
    varnishShaderId: null,
  }),
  listMaterials: () => [],
  material: () => null,
};

registerEffectPack(dbsFwEffectPack);
