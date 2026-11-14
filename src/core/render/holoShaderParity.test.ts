import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadLorcanaWebRecipes } from "@/lib/foilMetaLoad";
import {
  recipesFromSelectorRules,
  type LorcanaWebRecipesFile,
} from "@/providers/lorcana/lorcanatcg/pipeline/webRecipes";

import { holoShader, type HoloShader } from "./holoShaders";

/**
 * Field-by-field parity: runtime holoShader ≡ dumped recipes.json.
 *
 * The dump is produced by dumpWeb from the publisher CSS (seeded from the
 * foil-inner fixture offline). No hand-transcribed look table in TS.
 */

function shaderOf(id: string): HoloShader {
  const shader = holoShader(id);
  if (!shader) throw new Error(`holoShader: unknown id "${id}"`);
  return shader;
}

function normalize(value: string | undefined): string {
  return (
    (value ?? "")
      .replace(/\btransparent\b/g, "#0000")
      .replace(/rgba\(255,\s*255\s*,\s*255\s*,\s*0?\.8\)/g, "#fffc")
      .replace(/(^|[^\d])0\.(\d)/g, "$1.$2")
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ",")
      .replace(/\)\s*(?=[a-z])/g, ")")
      .trim()
      .toLowerCase()
  );
}

function normalizeRepeat(value: string | undefined): string {
  const normalized = normalize(value) || "repeat";
  return [...new Set(normalized.split(","))].join(",");
}

const RECIPES_PATH = path.join(
  process.cwd(),
  "data/lorcana/foil/web/recipes.json",
);
const FIXTURE_PATH = path.join(
  process.cwd(),
  "src/core/render/__fixtures__/lorcanaFoilCss.json",
);

describe("Lorcana recipes dump ↔ holoShader", () => {
  it("loads recipes.json with the publisher finish set", () => {
    const recipes = JSON.parse(
      readFileSync(RECIPES_PATH, "utf8"),
    ) as LorcanaWebRecipesFile;
    expect(recipes.finishMap.Lava).toBe("lava");
    expect(recipes.finishMap.Tinsel).toBe("tinsel");
    expect(recipes.looks.lava).toBeTruthy();
    expect(Object.keys(recipes.looks).length).toBeGreaterThan(10);
  });

  it("keeps recipes.json in sync with the foil-inner fixture parser", () => {
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const fromFixture = recipesFromSelectorRules(fixture);
    const onDisk = JSON.parse(
      readFileSync(RECIPES_PATH, "utf8"),
    ) as LorcanaWebRecipesFile;
    expect(onDisk.finishMap).toEqual(fromFixture.finishMap);
    expect(Object.keys(onDisk.looks).sort()).toEqual(
      Object.keys(fromFixture.looks).sort(),
    );
  });

  const recipes = loadLorcanaWebRecipes();
  const lookIds = Object.keys(recipes.looks ?? {}).sort();

  it("exposes every dumped look through holoShader", () => {
    expect(lookIds.length).toBeGreaterThan(0);
    for (const id of lookIds) {
      expect(holoShader(id)?.id).toBe(id);
      expect(holoShader(id)?.pointerFalloff).toBe(false);
    }
  });

  for (const id of lookIds) {
    describe(id, () => {
      it("matches dumped background-image / blend / filter / opacity", () => {
        const decl = recipes.looks![id]!;
        const look = shaderOf(id);
        expect(normalize(look.backgroundImage)).toBe(
          normalize(decl.backgroundImage),
        );
        expect(normalize(look.backgroundSize)).toBe(
          normalize(decl.backgroundSize),
        );
        expect(normalize(look.backgroundPosition)).toBe(
          normalize(decl.backgroundPosition),
        );
        expect(normalize(look.backgroundBlendMode)).toBe(
          normalize(decl.backgroundBlendMode),
        );
        expect(normalize(look.mixBlendMode)).toBe(
          normalize(decl.mixBlendMode),
        );
        expect(normalize(look.filter)).toBe(normalize(decl.filter));
        expect(look.opacity).toBe(decl.opacity);
      });

      it("matches dumped background-repeat", () => {
        const decl = recipes.looks![id]!;
        expect(normalizeRepeat(shaderOf(id).backgroundRepeat)).toBe(
          normalizeRepeat(decl.backgroundRepeat),
        );
      });
    });
  }

  it("keeps lore / satin overlay coats", () => {
    expect(shaderOf("lore").overlay).toBe("loreShine");
    expect(shaderOf("satin").overlay).toBe("satinShine");
  });
});
