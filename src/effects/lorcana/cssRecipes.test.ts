import { describe, expect, it } from "vitest";

import { isHoloShaderId } from "@/core/render/holoShaders";

import {
  DEFAULT_FINISH_CSS_ID,
  DEFAULT_VARNISH_CSS_ID,
  FINISH_CSS,
  VARNISH_CSS,
  resolveCssRecipe,
} from "./cssRecipes";

describe("resolveCssRecipe", () => {
  it.each(Object.entries(FINISH_CSS))(
    "maps catalogue finish %s → %s",
    (finish, shaderId) => {
      expect(resolveCssRecipe(finish, null).finishShaderId).toBe(shaderId);
      expect(isHoloShaderId(shaderId)).toBe(true);
    },
  );

  it.each(Object.entries(VARNISH_CSS))(
    "maps varnish %s → %s",
    (varnish, shaderId) => {
      expect(resolveCssRecipe("Silver", varnish).varnishShaderId).toBe(
        shaderId,
      );
      expect(isHoloShaderId(shaderId)).toBe(true);
    },
  );

  it("falls back to pack silver for an unknown foil finish", () => {
    // Same behaviour as the old core default — owned by the Lorcana pack now.
    expect(resolveCssRecipe("Kaleidoscope", null)).toEqual({
      finishShaderId: DEFAULT_FINISH_CSS_ID,
      varnishShaderId: null,
    });
    expect(DEFAULT_FINISH_CSS_ID).toBe("silver");
  });

  it("falls back to pack hotFoil for an unknown varnish type", () => {
    expect(resolveCssRecipe("Silver", "MysteryCoat")).toEqual({
      finishShaderId: "silver",
      varnishShaderId: DEFAULT_VARNISH_CSS_ID,
    });
  });

  it("returns no finish CSS when finish is empty (varnish-only materials)", () => {
    expect(resolveCssRecipe("", "HighGloss")).toEqual({
      finishShaderId: null,
      varnishShaderId: "hotFoil",
    });
  });
});
