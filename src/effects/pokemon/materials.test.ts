import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { foilTextureFile } from "@/effects/foilTextureFile";
import {
  FOIL_META_KEYS,
  resetFoilMetaCache,
} from "@/lib/foilMetaLoad";

import { POKEMON_FOIL_NAMES } from "./foilNames";
import {
  applyLiveFoilMask,
  listPokemonMaterialNames,
  mergeMaterialFloats,
  paperMaterial,
  parsePaperMaterialName,
  POKEMON_MAT_ALIASES,
  resetPaperMaterialCache,
  sharedMotifStems,
} from "./materials";

const SHARED_DIR = path.join(
  process.cwd(),
  "data",
  "pokemon",
  "foil",
  "textures",
);

describe("pokemon materials shared motifs", () => {
  it("binds dump-aligned textures/ files for every foil with motifs", () => {
    let slots = 0;
    for (const name of POKEMON_FOIL_NAMES) {
      const stems = sharedMotifStems(name);
      const material = paperMaterial(name);
      expect(material).toBeTruthy();
      for (const [slot, stem] of Object.entries(stems)) {
        slots += 1;
        expect(material!.textures[slot]?.file).toBe(foilTextureFile(stem));
        const webp = path.join(SHARED_DIR, foilTextureFile(stem));
        const png = path.join(SHARED_DIR, `${stem}.png`);
        expect(
          existsSync(webp) || existsSync(png),
          `${name}.${slot} → ${stem}`,
        ).toBe(true);
      }
    }
    expect(slots).toBeGreaterThan(40);
  });

  it("keeps art + foilMask + etch/cold roles on every leaf", () => {
    for (const name of POKEMON_FOIL_NAMES) {
      const m = paperMaterial(name)!;
      expect(m.textures._CardColorDiffuse?.role).toBe("art");
      if (name !== "NonFoil") {
        expect(m.textures._CardWhitePlateMask?.role).toBe("foilMask");
        // Every HoloFoil frag samples `_CardEtch` as a multiply plate. The
        // WebGL role must stay `varnishMask` so unbound → Unity white, not
        // the transparent CC fallback (see ROLE_TEXTURE_FALLBACK).
        expect(m.textures._CardEtch?.role).toBe("varnishMask");
        expect(m.textures._CardColdFoilMask?.role).toBe("secondVarnishMask");
        expect(m.webgl).not.toBe(false);
        // Live Linear: sRGB decode + OETF (Gamma×17.5 neon-clamped SunLava).
        expect(m.linearOutput).toBe(true);
        expect(m.textures._CardColorDiffuse?.srgb).toBe(true);
      }
    }
  });

  it("NonFoil stays CSS-only — no fake Unity↔web foil gap", () => {
    const m = paperMaterial("NonFoil")!;
    expect(m.webgl).toBe(false);
    expect(m.textures._CardWhitePlateMask).toBeUndefined();
    expect(m.textures._CardEtch).toBeUndefined();
    expect(parsePaperMaterialName("NonFoil")).toEqual({
      finish: "NonFoil",
      varnish: null,
    });
    expect(listPokemonMaterialNames()).not.toContain("NonFoil");
  });

  it("SolidColor: dump spectrum + animation malgré le sheet FoilAnimation=0", () => {
    const m = paperMaterial("SolidColor")!;
    expect(m.textures._SpectrumTexture?.file).toContain(
      "FX_T_Spectrum_Bands_Vertical",
    );
    expect(m.textures._SpectrumTexture?.file).not.toContain(
      "DesaturateOneSide",
    );
    expect(m.textures._barstexture?.file).toContain("T_HoloFoil_Bars_Mask");
    expect(m.textures._TextureLightSheen?.file).toContain(
      "T_Holofoil_Mask_Gradient_LightSheen",
    );
    // Sheet dumps `_FoilAnimation: 0` with `_FoilScrollingOn: 1` — coerce.
    expect(m.floats._FoilAnimation).toBe(1);
  });

  it("Galaxy Stars (and peer sparkle plates) use point filter", () => {
    /*
      T_Holofoil_Galaxy_Stars stores 1px RGB crosses + alpha dots. Bilinear
      min/mag turns them into soft circular bokeh — Live shows four-point
      stars. Nearest keeps the crosses.
    */
    const galaxy = paperMaterial("Galaxy")!;
    expect(galaxy.textures._StarsTexture?.file).toContain(
      "T_Holofoil_Galaxy_Stars",
    );
    expect(galaxy.textures._StarsTexture?.filter).toBe("point");
    expect(galaxy.textures._StarsTexture?.mipmaps).toBe(false);
    const cosmos = paperMaterial("Cosmos")!;
    expect(cosmos.textures._StarsTexture?.filter).toBe("point");
  });

  it("CrackedIce: dump spectrum Bands_Vertical (not DesaturateOneSide wash)", () => {
    /*
      shared-motifs binds FX_T_Spectrum_Bands_Vertical. An override to
      DesaturateOneSide made the ice gray/fade vs Live — keep dump plate.
    */
    const m = paperMaterial("CrackedIce")!;
    expect(m.textures._HolofoilSpectrumTexture?.file).toContain(
      "FX_T_Spectrum_Bands_Vertical",
    );
    expect(m.textures._HolofoilSpectrumTexture?.file).not.toContain(
      "DesaturateOneSide",
    );
    expect(m.textures._Texture_Shine?.file).toContain(
      "FX_T_Spectrum_Sunpillar3",
    );
    expect(m.textures._StarsTexture?.file).toContain(
      "T_Holofoil_Mask_Cracked_Ice_RGB",
    );
  });

  it("SunPillar: Northern Cross lié, UseCCFoil off jusqu'au foil_mask", () => {
    const m = paperMaterial("SunPillar")!;
    expect(m.textures._CCPatternTex?.file).toContain("FX_T_Northern_Cross");
    expect(m.floats._UseCCFoil).toBe(0);
    expect(
      paperMaterial("SunPillar", { foilMask: "CastAndCure" })!.floats
        ._UseCCFoil,
    ).toBe(1);
  });

  it("CastAndCure: même référence material (évite remount WebGL / clignotement)", () => {
    const a = paperMaterial("SunPillar", { foilMask: "CastAndCure" });
    const b = paperMaterial("SunPillar", { foilMask: "CastAndCure" });
    expect(a).toBe(b);
    expect(a).not.toBe(paperMaterial("SunPillar"));
  });

  it("GlobalReducedMotion defaults to 1 (not on MAT sheets)", () => {
    expect(paperMaterial("FlatSilver")!.floats._GlobalReducedMotionSetting).toBe(
      1,
    );
    expect(paperMaterial("SvHolo")!.floats._GlobalReducedMotionSetting).toBe(1);
  });

  it("FlatSilver_CC / Rainbow02 / SwSecreT02: sheet alias → frag parent", () => {
    for (const [alias, frag] of Object.entries(POKEMON_MAT_ALIASES)) {
      const m = paperMaterial(alias)!;
      expect(m.fragment).toBe(`${frag}.frag`);
    }
    const flatCc = paperMaterial("FlatSilver_CC")!;
    expect(flatCc.textures._CCPatternTex?.file).toContain("TEX_CC_PB");
    // Parent FlatSilver sheet leaves `_UseCCFoil = 0`; CC leaf must arm it
    // or Poké Balls stay gated off in FlatSilver.frag.
    expect(flatCc.floats._UseCCFoil).toBe(1);
    expect(paperMaterial("FlatSilver")!.floats._UseCCFoil).toBe(0);
    expect(
      paperMaterial("Rainbow02")!.textures._SpectrumTexture?.file,
    ).toContain("FX_T_Spectrum.webp");
  });

  it("ClassicFoil: dump motifs bind without override (me5-5c)", () => {
    expect(sharedMotifStems("ClassicFoil")).toMatchObject({
      _Tex_Starry: "T_Holofoil_Star_Classic",
      _Tex_Spectrum: "FX_T_Spectrum_Rainbow",
      _Tex_Glitter: "T_Holofoil_Noise_Pixel",
      _Tex_Shine: "T_Holofoil_Mask_Bar_Wide_Single",
    });
    const m = paperMaterial("ClassicFoil")!;
    expect(m.fragment).toBe("ClassicFoil.frag");
    expect(m.floats._UseCCFoil).toBe(0);
    expect(m.textures._Tex_Starry?.file).toContain("T_Holofoil_Star_Classic");
    expect(m.textures._Tex_Glitter?.file).toContain("T_Holofoil_Noise_Pixel");
  });

  it("Stamped: dump lighting floats + +Z sheet light (no WebGL float hack)", () => {
    expect(sharedMotifStems("Stamped")._Sampler5868).toBe("FX_T_Noise_Dim");
    const m = paperMaterial("Stamped")!;
    expect(m.fragment).toBe("Stamped.frag");
    expect(m.textures._Sampler5868?.file).toContain("FX_T_Noise_Dim");
    expect(m.textures._Highlight?.file).toContain("T_Stamped_HighlightPan");
    // MAT dump — UseVertexNomal remaps lit N to +Z; light rest must match.
    expect(m.floats._ShadowDarknessLimit).toBe(0.3);
    expect(m.floats._UseVertexNomal_On).toBe(1);
    expect(m.colors._LightDirection?.slice(0, 3)).toEqual([0, 0, 1]);
  });

  it("SunLava binds GLES SpectrumBright + DirectionTexture (not legacy _Spectrum)", () => {
    // Wrong override names left `_SpectrumBright` unbound → transparent
    // spectrum × art → muddy/dark foil despite white etch + correct light.
    // Dump frag hardcodes spectrum × 17.538 + N·L floor ~0.959 — no SDL uniforms.
    const stems = sharedMotifStems("SunLava");
    expect(stems._SpectrumBright).toBe("FX_T_Spectrum_SunLava");
    expect(stems._DirectionTexture).toBe("T_SunLava_Distortion_1");
    const m = paperMaterial("SunLava")!;
    expect(m.textures._SpectrumBright?.file).toContain("FX_T_Spectrum_SunLava");
    expect(m.textures._DirectionTexture?.file).toContain("T_SunLava_Distortion_1");
    expect(m.textures._Spectrum).toBeUndefined();
    // No etch TexEnv — unbound varnishMask must stay Unity-white (not black).
    expect(m.textures._CardEtch?.role).toBe("varnishMask");
    expect(m.textures._CardEtch?.file).toBeUndefined();
    expect(m.linearOutput).toBe(true);
    expect(m.textures._SpectrumBright?.srgb).toBe(true);
    // Dump flags Direction sRGB — Linear decode softens UV (avoids burnt chroma).
    expect(m.textures._DirectionTexture?.srgb).toBe(true);
    expect(m.floats._OverallBrightness).toBe(1);
    expect(m.floats._CardLighting_On).toBe(1);
    expect(m.floats._UseVertexNomal_On).toBe(1);
    expect(m.colors._LightDirection?.slice(0, 3)).toEqual([0, 0, 1]);
  });

  it("SvHolo / SvUltraScodix: samplers HLSLcc anonymes reliés", () => {
    expect(paperMaterial("SvHolo")!.textures._Sampler51071?.file).toContain(
      "FX_T_Noise_Dim",
    );
    const scodix = paperMaterial("SvUltraScodix")!;
    expect(scodix.textures._Sampler5366?.file).toContain("FX_T_Distort");
    expect(scodix.textures._Sampler5365?.file).toContain("FX_T_Distort");
    expect(scodix.textures._Sampler5408?.file).toContain("FX_T_Distort");
  });
});

describe("applyLiveFoilMask", () => {
  it("CastAndCure allume UseCCFoil sans toucher Holo", () => {
    const base = paperMaterial("SunPillar")!;
    expect(applyLiveFoilMask(base, "Holo")).toBe(base);
    expect(applyLiveFoilMask(base, "CastAndCure").floats._UseCCFoil).toBe(1);
  });

  it("ReverseLaminate* bind TEX_CC_PB / TEX_CC_MB", () => {
    const base = paperMaterial("FlatSilver")!;
    // Plain reverse: MAT leaves CC pattern unbound and `_UseCCFoil` off —
    // laminate masks flip CC on and bind the ball plate.
    expect(base.textures._CCPatternTex).toBeUndefined();
    expect(base.floats._UseCCFoil).toBe(0);
    expect(
      applyLiveFoilMask(base, "ReverseLaminatePokeBall").textures
        ._CCPatternTex?.file,
    ).toContain("TEX_CC_PB");
    expect(
      applyLiveFoilMask(base, "ReverseLaminateMasterBall").textures
        ._CCPatternTex?.file,
    ).toContain("TEX_CC_MB");
  });
});

describe("mergeMaterialFloats", () => {
  it("réveille FoilAnimation quand FoilScrollingOn est allumé", () => {
    expect(
      mergeMaterialFloats({
        _FoilAnimation: 0,
        _FoilScrollingOn: 1,
      })._FoilAnimation,
    ).toBe(1);
  });

  it("ne touche pas une FoilAnimation déjà non nulle", () => {
    expect(
      mergeMaterialFloats({
        _FoilAnimation: 0.3,
        _FoilScrollingOn: 1,
      })._FoilAnimation,
    ).toBe(0.3);
  });
});

describe("PikachuFoil motifs", () => {
  it("binds StitchedRings on _CCPatternTex and never TEX_CC_PB", () => {
    const stems = sharedMotifStems("PikachuFoil");
    expect(stems._CCPatternTex).toBe("TEX_StitchedRings");
    expect(Object.values(stems)).not.toContain("TEX_CC_PB");
    const m = paperMaterial("PikachuFoil")!;
    expect(m).toBeTruthy();
    expect(m.textures._CCPatternTex?.file).toContain("TEX_StitchedRings");
    expect(JSON.stringify(m.textures)).not.toContain("TEX_CC_PB");
    expect(m.floats._UseCCFoil).toBe(1);
    // ReverseLaminate must not be applied by default
    expect(m.textures._Tex_CC).toBeUndefined();
  });

  it("override wins over a Poké Ball entry in shared-motifs hydrate", () => {
    /*
      Server foil-meta cache once served `_CCPatternTex: TEX_CC_PB` for this
      leaf (bad pathid). Override must still force StitchedRings.
    */
    resetFoilMetaCache();
    const g = globalThis as typeof globalThis & {
      __PLACARR_FOIL_META__?: Record<string, unknown>;
    };
    g.__PLACARR_FOIL_META__ = {
      [FOIL_META_KEYS.sharedMotifs]: {
        PikachuFoil: {
          _CCPatternTex: "TEX_CC_PB",
          _SpectrumTex: "T_Holofoil_Pikachu_Spectrum",
          _TexDistort: "FX_T_Celeb_Confetti",
          _TexDots: "T_Holofoil_Pikachu_Dot",
        },
      },
      [FOIL_META_KEYS.materialSheets]: {},
      [FOIL_META_KEYS.textureFlags]: {},
      [FOIL_META_KEYS.fragStems]: { stems: ["PikachuFoil"] },
    };
    resetPaperMaterialCache();
    expect(sharedMotifStems("PikachuFoil")._CCPatternTex).toBe(
      "TEX_StitchedRings",
    );
    expect(
      paperMaterial("PikachuFoil")!.textures._CCPatternTex?.file,
    ).toContain("TEX_StitchedRings");
    resetFoilMetaCache();
    resetPaperMaterialCache();
  });
});
