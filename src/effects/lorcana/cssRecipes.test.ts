import { describe, expect, it } from "vitest";

import { isHoloShaderId } from "@/core/render/holoShaders";

import {
  DEFAULT_FINISH_CSS_ID,
  DEFAULT_VARNISH_CSS_ID,
  FINISH_CSS,
  VARNISH_CSS,
  hasDedicatedCssFinish,
  isCssFinishFallbackOnly,
  isCssVarnishFallbackOnly,
  lorcanaWebRecipeTextureStems,
  resolveCssRecipe,
} from "./cssRecipes";

describe("resolveCssRecipe", () => {
  it.each(Object.entries(FINISH_CSS))(
    "maps catalogue finish %s → %s",
    (finish, shaderId) => {
      expect(resolveCssRecipe(finish, null).finishShaderId).toBe(shaderId);
      expect(isHoloShaderId(shaderId)).toBe(true);
      expect(isCssFinishFallbackOnly(finish)).toBe(false);
      expect(hasDedicatedCssFinish(finish)).toBe(true);
    },
  );

  it.each(Object.entries(VARNISH_CSS))(
    "maps varnish %s → %s",
    (varnish, shaderId) => {
      expect(resolveCssRecipe("Silver", varnish).varnishShaderId).toBe(
        shaderId,
      );
      expect(isHoloShaderId(shaderId)).toBe(true);
      expect(isCssVarnishFallbackOnly(varnish)).toBe(false);
    },
  );

  it("falls back to pack silver for an unknown foil finish", () => {
    // Same behaviour as the old core default — owned by the Lorcana pack now.
    expect(resolveCssRecipe("Kaleidoscope", null)).toEqual({
      finishShaderId: DEFAULT_FINISH_CSS_ID,
      varnishShaderId: null,
    });
    expect(DEFAULT_FINISH_CSS_ID).toBe("silver");
    expect(isCssFinishFallbackOnly("Kaleidoscope")).toBe(true);
  });

  it("does not flag Silver / None as fallback-only gaps", () => {
    expect(isCssFinishFallbackOnly("Silver")).toBe(false);
    expect(isCssFinishFallbackOnly("None")).toBe(false);
    expect(isCssFinishFallbackOnly("")).toBe(false);
  });

  it("falls back to pack hotFoil for an unknown varnish type", () => {
    expect(resolveCssRecipe("Silver", "MysteryCoat")).toEqual({
      finishShaderId: "silver",
      varnishShaderId: DEFAULT_VARNISH_CSS_ID,
    });
    expect(isCssVarnishFallbackOnly("MysteryCoat")).toBe(true);
    expect(isCssVarnishFallbackOnly("HighGloss")).toBe(false);
    expect(isCssVarnishFallbackOnly("MetallicHotFoil")).toBe(false);
  });

  it("returns no finish CSS when finish is empty (varnish-only materials)", () => {
    expect(resolveCssRecipe("", "HighGloss")).toEqual({
      finishShaderId: null,
      varnishShaderId: "hotFoil",
    });
  });

  it("lists recipe texture stems used by ported looks", () => {
    const stems = lorcanaWebRecipeTextureStems();
    expect(stems.has("silverc")).toBe(true);
    expect(stems.has("frame")).toBe(false);
  });
});
