/**
 * Linear vs sRGB golden — pack contracts for WebGL upload + frag prep.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetEffectPacksForTests,
  registerEffectPack,
} from "@/core/render/foil/backend";
import {
  foilFragmentNeedsLinearEncode,
  foilTextureInternalFormat,
} from "@/core/render/foil/capabilities";
import { listLorcanaMaterialNames } from "@/effects/lorcana/manifest";
import { lorcanaEffectPack } from "@/effects/lorcana";
import { pokemonPaperEffectPack } from "@/effects/pokemon";
import { listPokemonMaterialNames } from "@/effects/pokemon/materials";

describe("foilTextureInternalFormat / linear encode", () => {
  it("decodes sRGB only for Linear + srgb bindings", () => {
    expect(
      foilTextureInternalFormat({ linearOutput: true, srgb: true }),
    ).toBe("srgb8_alpha8");
    expect(
      foilTextureInternalFormat({ linearOutput: true, srgb: false }),
    ).toBe("rgba8");
    expect(
      foilTextureInternalFormat({ linearOutput: false, srgb: true }),
    ).toBe("rgba8");
    expect(foilTextureInternalFormat({})).toBe("rgba8");
  });

  it("OETF-encodes Linear fragments only", () => {
    expect(foilFragmentNeedsLinearEncode(true)).toBe(true);
    expect(foilFragmentNeedsLinearEncode(false)).toBe(false);
    expect(foilFragmentNeedsLinearEncode(undefined)).toBe(false);
  });
});

describe("pack color-space goldens", () => {
  beforeEach(() => {
    __resetEffectPacksForTests();
  });

  it.skipIf(listPokemonMaterialNames().length === 0)(
    "Pokémon Live materials are Linear + sRGB art",
    () => {
      registerEffectPack(pokemonPaperEffectPack);
      const sample = ["SunPillar", "FlatSilver", "Cosmos"].filter((name) =>
        listPokemonMaterialNames().includes(name),
      );
      expect(sample.length).toBeGreaterThan(0);
      for (const name of sample) {
        const m = pokemonPaperEffectPack.material(name);
        expect(m?.linearOutput, name).toBe(true);
        expect(m?.textures._CardColorDiffuse?.srgb, name).toBe(true);
        expect(
          foilTextureInternalFormat({
            linearOutput: m?.linearOutput,
            srgb: m?.textures._CardColorDiffuse?.srgb,
          }),
          name,
        ).toBe("srgb8_alpha8");
        expect(foilFragmentNeedsLinearEncode(m?.linearOutput), name).toBe(
          true,
        );
      }
    },
  );

  it.skipIf(listLorcanaMaterialNames().length === 0)(
    "Lorcana dump materials stay Gamma (raw RGBA, no OETF)",
    () => {
      registerEffectPack(lorcanaEffectPack);
      const sample = listLorcanaMaterialNames()
        .filter((n) => /CardFoil|CardMagma|CardLore/i.test(n))
        .slice(0, 8);
      expect(sample.length).toBeGreaterThan(0);
      for (const name of sample) {
        const m = lorcanaEffectPack.material(name);
        expect(m, name).toBeTruthy();
        expect(m!.linearOutput, name).toBeFalsy();
        expect(
          foilTextureInternalFormat({
            linearOutput: m!.linearOutput,
            srgb: true,
          }),
          name,
        ).toBe("rgba8");
        expect(foilFragmentNeedsLinearEncode(m!.linearOutput), name).toBe(
          false,
        );
      }
    },
  );
});
