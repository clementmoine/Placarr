import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { foilTextureFile } from "@/effects/foilTextureFile";

import { POKEMON_FOIL_NAMES } from "./foilNames";
import {
  applyLiveFoilMask,
  listPokemonMaterialNames,
  mergeMaterialFloats,
  paperMaterial,
  parsePaperMaterialName,
  POKEMON_MAT_ALIASES,
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

  it("keeps art + foilMask roles on every leaf", () => {
    for (const name of POKEMON_FOIL_NAMES) {
      const m = paperMaterial(name)!;
      expect(m.textures._CardColorDiffuse?.role).toBe("art");
      if (name !== "NonFoil") {
        expect(m.textures._CardWhitePlateMask?.role).toBe("foilMask");
        expect(m.webgl).not.toBe(false);
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

  it("SolidColor: motifs + animation malgré le sheet FoilAnimation=0", () => {
    const m = paperMaterial("SolidColor")!;
    expect(m.textures._SpectrumTexture?.file).toContain(
      "FX_T_Spectrum_Bands_DesaturateOneSide",
    );
    expect(m.textures._barstexture?.file).toContain("T_HoloFoil_Bars_Mask");
    expect(m.textures._TextureLightSheen1?.file).toContain(
      "T_Holofoil_Mask_Gradient_LightSheen",
    );
    // Sheet dumps `_FoilAnimation: 0` with `_FoilScrollingOn: 1` — coerce.
    expect(m.floats._FoilAnimation).toBe(1);
  });

  it("SunPillar: Northern Cross lié, UseCCFoil off jusqu'au foil_mask", () => {
    const m = paperMaterial("SunPillar")!;
    expect(m.textures._Tex_CC?.file).toContain("FX_T_Northern_Cross");
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

  it("FlatSilver_CC / Rainbow02 / SwSecreT02: sheet alias → frag parent", () => {
    for (const [alias, frag] of Object.entries(POKEMON_MAT_ALIASES)) {
      const m = paperMaterial(alias)!;
      expect(m.fragment).toBe(`${frag}.frag`);
    }
    expect(paperMaterial("FlatSilver_CC")!.textures._Tex_CC?.file).toContain(
      "TEX_CC_PB",
    );
    expect(
      paperMaterial("Rainbow02")!.textures._SpectrumTexture?.file,
    ).toContain("FX_T_Spectrum.webp");
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
    // Plain reverse: MAT leaves `_Tex_CC` unbound (CC overlay α-gated off).
    expect(base.textures._Tex_CC).toBeUndefined();
    expect(base.floats._UseCCFoil).toBe(1);
    expect(
      applyLiveFoilMask(base, "ReverseLaminatePokeBall").textures._Tex_CC?.file,
    ).toContain("TEX_CC_PB");
    expect(
      applyLiveFoilMask(base, "ReverseLaminateMasterBall").textures._Tex_CC
        ?.file,
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
