/**
 * Finish → CSS id + Unity frag stem matrix (Pokémon Live + Lorcana).
 * Locks the audit gap: every known finish resolves to a CSS look, and every
 * WebGL leaf has a dumped `.frag` when the shader tree is present.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HOUSE_FOIL_FALLBACK_CSS_ID } from "@/core/render/foil/backend";
import { HOLO_SHADER_IDS } from "@/core/render/holoShaderIds";
import { POKEMON_HOLO_SHADER_IDS } from "@/core/render/holoShadersPokemon";
import { SIMEY_HOLO_SHADER_IDS } from "@/core/render/holoShadersSimey";
import {
  finishCssMap,
  resolveCssRecipe as resolveLorcanaCss,
} from "@/effects/lorcana/cssRecipes";
import {
  LIVE_FINISH_CSS,
  resolveCssRecipe as resolvePokemonCss,
  resolveLiveFinishCssId,
} from "@/effects/pokemon/cssRecipes";
import {
  POKEMON_MAT_ALIASES,
  POKEMON_MATERIAL_NAMES,
} from "@/effects/pokemon/materials";
import { packShadersDir } from "@/lib/packPaths";

const CSS_LOOK_IDS = new Set<string>([
  ...(HOLO_SHADER_IDS as readonly string[]),
  ...(POKEMON_HOLO_SHADER_IDS as readonly string[]),
  ...(SIMEY_HOLO_SHADER_IDS as readonly string[]),
  HOUSE_FOIL_FALLBACK_CSS_ID,
]);

const POKEMON_SHADERS = packShadersDir("pokemon");
const LORCANA_SHADERS = packShadersDir("lorcana");

function listFragStems(dir: string): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((name) => name.endsWith(".frag"))
      .map((name) => name.replace(/\.frag$/i, "")),
  );
}

describe("finish → CSS matrix (Pokémon Live)", () => {
  it("every LIVE_FINISH_CSS look id is a known CSS recipe id", () => {
    for (const [leaf, cssId] of Object.entries(LIVE_FINISH_CSS)) {
      expect(CSS_LOOK_IDS.has(cssId), `${leaf} → ${cssId}`).toBe(true);
    }
  });

  it("resolveCssRecipe mirrors LIVE_FINISH_CSS for each Live leaf", () => {
    for (const [leaf, cssId] of Object.entries(LIVE_FINISH_CSS)) {
      expect(resolveLiveFinishCssId(leaf)).toBe(cssId);
      expect(resolvePokemonCss(leaf, null).finishShaderId).toBe(cssId);
    }
  });

  it.skipIf(!existsSync(POKEMON_SHADERS))(
    "every pack material leaf has a dumped .frag (alias-aware)",
    () => {
      const stems = listFragStems(POKEMON_SHADERS);
      expect(stems.size).toBeGreaterThan(0);
      for (const name of POKEMON_MATERIAL_NAMES) {
        const fragStem =
          POKEMON_MAT_ALIASES[name as keyof typeof POKEMON_MAT_ALIASES] ?? name;
        expect(stems.has(fragStem), `missing frag ${fragStem} for ${name}`).toBe(
          true,
        );
      }
    },
  );

  it.skipIf(!existsSync(POKEMON_SHADERS))(
    "every LIVE_FINISH_CSS Unity leaf maps to a dumped .frag when known as a material",
    () => {
      const stems = listFragStems(POKEMON_SHADERS);
      const materialSet = new Set<string>(POKEMON_MATERIAL_NAMES as readonly string[]);
      for (const leaf of Object.keys(LIVE_FINISH_CSS)) {
        if (leaf === "25thConfetti") continue; // deprecated dump alias
        if (!materialSet.has(leaf)) continue;
        const fragStem =
          POKEMON_MAT_ALIASES[leaf as keyof typeof POKEMON_MAT_ALIASES] ?? leaf;
        expect(stems.has(fragStem), `${leaf} → ${fragStem}.frag`).toBe(true);
      }
    },
  );
});

describe("finish → CSS matrix (Lorcana)", () => {
  it("finishCssMap values resolve to a known CSS look or house flare", () => {
    for (const [finish, cssId] of Object.entries(finishCssMap())) {
      const resolved = resolveLorcanaCss(finish, null).finishShaderId;
      expect(resolved, finish).toBeTruthy();
      expect(
        CSS_LOOK_IDS.has(resolved!) ||
          resolved === cssId ||
          resolved === HOUSE_FOIL_FALLBACK_CSS_ID,
        `${finish} → map=${cssId} resolved=${resolved}`,
      ).toBe(true);
    }
  });

  it.skipIf(!existsSync(LORCANA_SHADERS))(
    "Lorcana shader dump is non-empty (tilt/time siblings audited elsewhere)",
    () => {
      expect(listFragStems(LORCANA_SHADERS).size).toBeGreaterThan(0);
    },
  );
});
