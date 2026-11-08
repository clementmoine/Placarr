/**
 * Kayou lenticular e2e — finish → pack CSS recipe → FoilCardImage inputs.
 * Multi-panel HR types must expose grid + kayouLenticular shader; singles
 * stay house flare with a null grid.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetEffectPacksForTests,
  getEffectPack,
  registerEffectPack,
} from "@/core/render/foil/backend";

import {
  KAYOU_LENTICULAR_TYPES,
  narutoKayouEffectPack,
  NARUTO_KAYOU_EFFECT_PACK_ID,
} from "./index";

describe("Kayou lenticular e2e", () => {
  beforeEach(() => {
    __resetEffectPacksForTests();
    registerEffectPack(narutoKayouEffectPack);
  });

  it("registers the Kayou pack under its effect id", () => {
    expect(getEffectPack(NARUTO_KAYOU_EFFECT_PACK_ID)?.id).toBe(
      NARUTO_KAYOU_EFFECT_PACK_ID,
    );
  });

  it.each(
    KAYOU_LENTICULAR_TYPES.filter((t) => t.panelCols * t.panelRows > 1),
  )(
    "$id → multi-panel CSS recipe for FoilCardImage",
    (typed) => {
      const recipe = narutoKayouEffectPack.resolveCss(typed.finish);
      expect(recipe.finishShaderId).toBe("kayouLenticular");
      expect(recipe.lenticularGrid).toEqual({
        cols: typed.panelCols,
        rows: typed.panelRows,
      });
      if (typed.lenticularCropProfile) {
        expect(recipe.lenticularCropProfile).toBe(typed.lenticularCropProfile);
      }
      expect(recipe.varnishShaderId).toBeNull();
    },
  );

  it.each(
    KAYOU_LENTICULAR_TYPES.filter((t) => t.panelCols * t.panelRows <= 1),
  )("$id → single-panel house flare, no lenticular grid", (typed) => {
    const recipe = narutoKayouEffectPack.resolveCss(typed.finish);
    expect(recipe.finishShaderId).toBe(typed.shader);
    expect(recipe.lenticularGrid).toBeNull();
    expect(recipe.lenticularCropProfile).toBeUndefined();
  });

  it("accepts × spelling aliases on finish resolve", () => {
    const recipe = narutoKayouEffectPack.resolveCss("HR-2×2");
    expect(recipe.lenticularGrid).toEqual({ cols: 2, rows: 2 });
    expect(recipe.finishShaderId).toBe("kayouLenticular");
  });
});
