/**
 * Pack d'effets Naruto Kayou — catalogue only, house CSS foil (pas de dump).
 *
 * HR scans are portrait sprite sheets (2×2, 3×2, …). Multi-panel materials
 * crop one panel at a time from tilt; single-panel types use house flare.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";
import type { FoilCssRecipe } from "@/core/render/foil/types";
import { resolveFixedLenticularPanelCrops } from "@/core/render/kayouLenticularArt";
import { orientationFromLenticularGrid } from "@/lib/text/artFaceOrientation";

import {
  kayouLenticularFinishShader,
  kayouLenticularTypeForFinish,
  KAYOU_LENTICULAR_TYPE_IDS,
} from "./lenticularTypes";

export const NARUTO_KAYOU_EFFECT_PACK_ID = "naruto-kayou";

const ASSET_BASE = "/assets/naruto/kayou";

/** narutocards.ca Heaven Scroll / t4w4 lenticular strip size. */
const KAYOU_LENTICULAR_STRIP_W = 320;
const KAYOU_LENTICULAR_STRIP_H = 450;

export const NARUTO_KAYOU_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;

const FINISH_SHADER = kayouLenticularFinishShader();

/** Finish names this pack renders, lower-cased as they are stored. */
export const NARUTO_KAYOU_FINISHES = KAYOU_LENTICULAR_TYPE_IDS;

export { KAYOU_LENTICULAR_TYPES, kayouLenticularTypeForFinish } from "./lenticularTypes";

function resolveKayouCss(finish: string): FoilCssRecipe {
  const key = (finish ?? "").trim().toLowerCase();
  const typed = kayouLenticularTypeForFinish(key);
  const shaderId = FINISH_SHADER[key] ?? null;

  if (typed && typed.panelCols * typed.panelRows > 1) {
    const lenticularGrid = { cols: typed.panelCols, rows: typed.panelRows };
    const fixedCrops = typed.lenticularCropProfile
      ? resolveFixedLenticularPanelCrops(
          typed.lenticularCropProfile,
          lenticularGrid,
          KAYOU_LENTICULAR_STRIP_W,
          KAYOU_LENTICULAR_STRIP_H,
        )
      : null;
    const landscapeFace =
      typed.landscapeFace ??
      orientationFromLenticularGrid(
        KAYOU_LENTICULAR_STRIP_W,
        KAYOU_LENTICULAR_STRIP_H,
        lenticularGrid,
        fixedCrops,
      ).landscapeFace;
    return {
      finishShaderId: shaderId,
      varnishShaderId: null,
      lenticularGrid,
      ...(typed.lenticularCropProfile
        ? { lenticularCropProfile: typed.lenticularCropProfile }
        : {}),
      ...(landscapeFace ? { landscapeFace: true } : {}),
    };
  }

  return {
    finishShaderId: shaderId,
    varnishShaderId: null,
    lenticularGrid: null,
  };
}

export const narutoKayouEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_KAYOU_EFFECT_PACK_ID,
  label: "Naruto Kayou",
  blurb: "Catalogue local Kayou — lenticular sprite CSS, sans dump Unity",
  assetBase: ASSET_BASE,
  cardBackUrl: `${ASSET_BASE}/cards/back.webp`,
  finishShader: FINISH_SHADER,
  listHouseFinishesAsMaterials: true,
  fallbackFoilMaskUrl: NARUTO_KAYOU_FULL_FOIL_MASK_URL,
  resolveCss: (finish) => resolveKayouCss(finish),
});
