/**
 * Product WebGL path: materialName (Live leaf) without liveFoilMask prop must
 * still arm CastAndCure / ReverseLaminate* via printKey join.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as liveFoilMasks from "./liveFoilMasks";
import * as resolveEffect from "./resolveEffect";

import { pokemonPaperEffectPack } from "./index";

function fakeResolution(
  overrides: Partial<resolveEffect.PaperEffectResolution> = {},
): resolveEffect.PaperEffectResolution {
  return {
    shader: "SunPillar",
    variant: "std",
    confidence: "exact",
    source: "tcglive-bundle",
    maskTex: null,
    cardTex: null,
    etchTex: null,
    coldFoilTex: null,
    bundle: "me5_fr_045",
    ...overrides,
  };
}

describe("pokemon materialForPrint foil_mask (product)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("arms CastAndCure from printKey when liveFoilMask is omitted", () => {
    vi.spyOn(resolveEffect, "resolveEffectForPrintKey").mockReturnValue(
      fakeResolution(),
    );
    vi.spyOn(liveFoilMasks, "resolveLiveFoilMaskOverride").mockReturnValue(
      "CastAndCure",
    );

    const withoutPrint = pokemonPaperEffectPack.materialForPrint!("SunPillar");
    expect(withoutPrint?.floats._UseCCFoil).toBe(0);

    const withPrint = pokemonPaperEffectPack.materialForPrint!("SunPillar", {
      printKey: "pokemon:me05.5-045",
      finish: "holo",
    });
    expect(resolveEffect.resolveEffectForPrintKey).toHaveBeenCalledWith(
      "pokemon:me05.5-045",
      "holo",
      "fr",
      undefined,
    );
    expect(liveFoilMasks.resolveLiveFoilMaskOverride).toHaveBeenCalledWith({
      bundleId: "me5_fr_045",
      variant: "std",
      maskTex: null,
    });
    expect(withPrint?.floats._UseCCFoil).toBe(1);
  });

  it("binds Poké Ball laminate from whiteplate when map is ambiguous", () => {
    // Dump indexes laminates as std + _wp_sph_; liveFoilMasks keys ::sph/::mph.
    // Product resolve only has std|ph — map returns null for dual stems.
    vi.spyOn(resolveEffect, "resolveEffectForPrintKey").mockReturnValue(
      fakeResolution({
        shader: "FlatSilver",
        variant: "std",
        bundle: "rsv10-5_fr_001",
        maskTex: "rsv10-5_wp_sph_fr_001",
      }),
    );

    const m = pokemonPaperEffectPack.materialForPrint!("FlatSilver", {
      printKey: "pokemon:rsv10.5-001",
      finish: "holo",
    });
    expect(m?.floats._UseCCFoil).toBe(1);
    expect(m?.textures._CCPatternTex?.file).toContain("TEX_CC_PB");
  });

  it("binds Master Ball laminate from mask-mph URL stem", () => {
    vi.spyOn(resolveEffect, "resolveEffectForPrintKey").mockReturnValue(
      fakeResolution({
        shader: "FlatSilver",
        variant: "std",
        bundle: "rsv10-5_fr_044",
        maskTex: "mask-mph.webp",
      }),
    );

    const m = pokemonPaperEffectPack.materialForPrint!("FlatSilver", {
      printKey: "pokemon:rsv10.5-044",
      finish: "holo",
    });
    expect(m?.floats._UseCCFoil).toBe(1);
    expect(m?.textures._CCPatternTex?.file).toContain("TEX_CC_MB");
  });

  it("explicit foilMask wins over printKey lookup", () => {
    const resolveSpy = vi
      .spyOn(resolveEffect, "resolveEffectForPrintKey")
      .mockReturnValue(fakeResolution());
    const maskSpy = vi.spyOn(liveFoilMasks, "resolveLiveFoilMaskOverride");

    const m = pokemonPaperEffectPack.materialForPrint!("SunPillar", {
      printKey: "pokemon:me05.5-045",
      foilMask: "None",
    });
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(maskSpy).not.toHaveBeenCalled();
    expect(m?.floats._UseCCFoil).toBe(0);
  });
});
