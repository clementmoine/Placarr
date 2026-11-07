import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  cssFinishResolveKey,
  HOUSE_FOIL_FALLBACK_CSS_ID,
} from "@/core/render/foil/backend";
import { holoShader, isHoloShaderId } from "@/core/render/holoShaders";
import { loadLorcanaWebRecipes } from "@/lib/foilMetaLoad";

import {
  hasDedicatedCssFinish,
  isCssFinishFallbackOnly,
  resolveCssRecipe,
} from "./cssRecipes";
import { parseMaterialName } from "./resolveMaterial";

/**
 * Every dumped Unity leaf must hit its publisher CSS look when the playroom
 * (or FoilCardImage) peels via {@link cssFinishResolveKey}.
 *
 * The bug this pins: resolveCss(`CardFoilLava`) → house flare while the
 * recipe `lava` sat unused. Parity tests prove the declarations; this proves
 * the wire from material name → look id.
 */
const MANIFEST = path.join(
  process.cwd(),
  "data/lorcana/foil/manifest.json",
);

function dumpedMaterialNames(): string[] {
  const raw = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<
    string,
    unknown
  >;
  return Object.keys(raw).sort();
}

describe("Lorcana CSS wiring from dumped Unity leaves", () => {
  it("loads the foil manifest", () => {
    expect(dumpedMaterialNames().length).toBeGreaterThan(10);
  });

  it("loads web recipes.json with a finishMap for every publisher finish", () => {
    const recipes = loadLorcanaWebRecipes();
    expect(recipes.finishMap?.Lava).toBe("lava");
    expect(recipes.looks?.lava).toBeTruthy();
    for (const [finish, lookId] of Object.entries(recipes.finishMap ?? {})) {
      expect(recipes.looks?.[lookId], finish).toBeTruthy();
    }
  });

  it.each(dumpedMaterialNames())(
    "%s peels to a dedicated look or an honest varnish-only / flare gap",
    (materialName) => {
      const { finish, varnish } = parseMaterialName(materialName);
      const key = cssFinishResolveKey({
        finish,
        materialName,
        parseMaterialName,
      });
      // Leaf-only path (no catalogue finish prop) must peel the same way.
      const peeledKey = cssFinishResolveKey({
        materialName,
        parseMaterialName,
      });
      expect(peeledKey).toBe(key);

      const { finishShaderId, varnishShaderId } = resolveCssRecipe(
        key,
        varnish,
      );

      if (!finish) {
        // CardVarnish* — no catalogue finish; varnish coat only when named.
        expect(finishShaderId).toBeNull();
        return;
      }

      if (hasDedicatedCssFinish(finish) || hasDedicatedCssFinish(key)) {
        expect(finishShaderId).not.toBe(HOUSE_FOIL_FALLBACK_CSS_ID);
        expect(finishShaderId).toBeTruthy();
        expect(isHoloShaderId(finishShaderId!)).toBe(true);
        expect(holoShader(finishShaderId!)).toBeTruthy();
        expect(isCssFinishFallbackOnly(finish)).toBe(false);
      } else {
        // Unknown shiny finish → house flare (honest gap).
        expect(finishShaderId).toBe(HOUSE_FOIL_FALLBACK_CSS_ID);
      }

      if (varnish) {
        expect(varnishShaderId).toBeTruthy();
        expect(isHoloShaderId(varnishShaderId!)).toBe(true);
      }

      // Old FoilCardImage bug: resolveCss(materialName) missed every CardFoil*.
      if (hasDedicatedCssFinish(finish) || hasDedicatedCssFinish(key)) {
        const naive = resolveCssRecipe(materialName, varnish);
        expect(
          naive.finishShaderId,
          `${materialName} must not resolve via the raw Unity leaf`,
        ).toBe(HOUSE_FOIL_FALLBACK_CSS_ID);
      }
    },
  );
});
