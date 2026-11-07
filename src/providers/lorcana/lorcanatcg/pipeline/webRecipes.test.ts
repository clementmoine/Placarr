import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyFoilInnerSelector,
  normalizeRecipeValue,
  parseFoilInnerRulesFromCss,
  recipesFromSelectorRules,
  textureStemsFromRecipes,
} from "./webRecipes";

const FIXTURE = path.join(
  process.cwd(),
  "src/core/render/__fixtures__/lorcanaFoilCss.json",
);

describe("webRecipes", () => {
  it("rewrites hashed CDN urls to stable pack paths", () => {
    expect(
      normalizeRecipeValue(
        "url(/assets/lava2-CSqijIl2.jpg), repeating-linear-gradient(65deg, #0004 12.5%)",
      ),
    ).toContain("url(/assets/lorcana/web/lava2.jpg)");
  });

  it("rewrites colorX+colorY to --combined", () => {
    expect(
      normalizeRecipeValue(
        "calc(var(--colorX) * 1 + var(--colorY)) center, center",
      ),
    ).toBe("var(--combined) center, center");
  });

  it("classifies finish / varnish / shine selectors", () => {
    expect(
      classifyFoilInnerSelector(".Lava .foil-shine .foil-inner"),
    ).toEqual({ lookId: "lava", finishes: ["Lava"] });
    expect(
      classifyFoilInnerSelector(
        ".FreeForm1 .foil-shine .foil-inner,.FreeForm2 .foil-shine .foil-inner",
      ),
    ).toEqual({ lookId: "freeForm", finishes: ["FreeForm1", "FreeForm2"] });
    expect(
      classifyFoilInnerSelector(
        ".foil-top-shine.ChromeRainbowHotFoil .foil-inner",
      ),
    ).toEqual({
      lookId: "chromeRainbowHotFoil",
      finishes: [],
      varnish: "ChromeRainbowHotFoil",
    });
    expect(
      classifyFoilInnerSelector(".foil-top-shine-2 .foil-inner"),
    ).toBeNull();
  });

  it("builds recipes from the committed foil-inner fixture", () => {
    const rules = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const recipes = recipesFromSelectorRules(rules);
    expect(recipes.finishMap.Lava).toBe("lava");
    expect(recipes.finishMap.FreeForm1).toBe("freeForm");
    expect(recipes.finishMap.Tinsel).toBe("tinsel");
    expect(recipes.looks.lava?.mixBlendMode).toBe("color-dodge");
    expect(recipes.looks.lava?.backgroundImage).toContain(
      "/assets/lorcana/web/lava2.jpg",
    );
    expect(recipes.looks.satin?.backgroundPosition).toContain(
      "var(--combined)",
    );
    expect(recipes.looks.seaWave?.backgroundImage).toContain("seawavec.jpg");
    expect(recipes.looks.hotFoil).toBeTruthy();
    expect(recipes.varnishMap.ChromeRainbowHotFoil).toBe(
      "chromeRainbowHotFoil",
    );
    expect(textureStemsFromRecipes(recipes).has("lava2")).toBe(true);
  });

  it("parses minified CSS foil-inner rules", () => {
    const css = `
.Silver .foil-shine .foil-inner{background-image:url(/assets/silverc-B7Q2CuyS.jpg),url(/assets/satin-BFAj3gek.jpg);mix-blend-mode:hard-light;opacity:.5}
.Lava .foil-shine .foil-inner{background-image:url(/assets/lava2-CSqijIl2.jpg);mix-blend-mode:color-dodge}
.foil-top-shine-2 .foil-inner{background-image:url(/assets/satind-D6ITxknP.png)}
`;
    const rules = parseFoilInnerRulesFromCss(css);
    expect(Object.keys(rules).sort()).toEqual(
      [
        ".Lava .foil-shine .foil-inner",
        ".Silver .foil-shine .foil-inner",
        ".foil-top-shine-2 .foil-inner",
      ].sort(),
    );
    const recipes = recipesFromSelectorRules(rules);
    expect(recipes.looks.silver?.opacity).toBe(0.5);
    expect(recipes.looks["foil-top-shine-2"]).toBeUndefined();
  });
});
