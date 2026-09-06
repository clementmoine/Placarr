/**
 * Unit tests for simeydotme catalogue / rarity foil adaptations.
 */

import { describe, expect, it } from "vitest";

import { holoShader } from "@/core/render/holoShaders";
import {
  isSimeyHoloShaderId,
  SIMEY_HOLO_SHADER_IDS,
  simeyHoloShader,
} from "@/core/render/holoShadersSimey";

describe("holoShadersSimey", () => {
  it("registers every id through holoShader()", () => {
    for (const id of SIMEY_HOLO_SHADER_IDS) {
      expect(isSimeyHoloShaderId(id)).toBe(true);
      expect(holoShader(id)?.id).toBe(id);
      expect(simeyHoloShader(id).id).toBe(id);
      expect(simeyHoloShader(id).filter, id).toContain(
        "var(--pointer-from-center, 0)",
      );
    }
  });

  it("keeps regularHolo on poke-holo’s 110° spectrum + scanlines", () => {
    const look = simeyHoloShader("regularHolo");
    expect(look.backgroundImage).toContain("110deg");
    expect(look.mixBlendMode).toBe("color-dodge");
    expect(look.overlay).toBe("regularHoloBars");
  });

  it("keeps reverseHolo on soft-light + difference dodge", () => {
    const look = simeyHoloShader("reverseHolo");
    expect(look.backgroundBlendMode).toBe("soft-light, difference");
    expect(look.mixBlendMode).toBe("color-dodge");
  });

  it("paints rainbowHolo with Live Spectrum + glitter (simey choreography)", () => {
    const look = simeyHoloShader("rainbowHolo");
    expect(look.backgroundBlendMode).toBe("luminosity, soft-light");
    expect(look.overlay).toBe("rainbowHoloCoat");
    expect(look.backgroundImage).toContain("simey_glitter");
    expect(look.backgroundImage).toContain("FX_T_Spectrum.webp");
  });

  it("paints rainbowAlt with simey bands + Live Spectrum / Highlight tooth", () => {
    const look = simeyHoloShader("rainbowAlt");
    expect(look.backgroundImage).toContain("repeating-linear-gradient");
    expect(look.backgroundImage).toContain("FX_T_Spectrum_Rainbow");
    expect(look.backgroundImage).toContain("FX_T_Highlight_Over");
    expect(look.backgroundImage).toContain("T_CloudNoise");
    expect(look.backgroundBlendMode).toBe(
      "luminosity, overlay, soft-light, soft-light",
    );
    expect(look.overlay).toBe("rainbowAltCoat");
    const coat = simeyHoloShader("rainbowAltCoat");
    expect(coat.backgroundImage).toContain("FX_T_Highlight_Over");
    expect(coat.opacity).toBe(0.85);
  });

  it("ships cosmos / secret / poke-ball / V family on Live + vendored Simey FX", () => {
    expect(simeyHoloShader("cosmosHolo").mixBlendMode).toBe("color-dodge");
    expect(simeyHoloShader("cosmosHolo").backgroundImage).toContain(
      "simey_cosmos-bottom",
    );
    expect(simeyHoloShader("cosmosHolo").backgroundImage).toContain(
      "FX_T_Spectrum_Bands_Rainbow_Bright",
    );
    expect(simeyHoloShader("cosmosHolo").backgroundImage).toMatch(
      /repeating-linear-gradient\(\s*82deg/,
    );
    expect(simeyHoloShader("cosmosHolo").overlay).toBe("cosmosHoloCoat");
    expect(simeyHoloShader("cosmosHoloCoat").backgroundImage).toContain(
      "simey_cosmos-middle-trans",
    );
    expect(simeyHoloShader("cosmosHoloCoat").overlay).toBe("cosmosHoloTop");
    expect(simeyHoloShader("cosmosHoloTop").backgroundImage).toContain(
      "simey_cosmos-top-trans",
    );
    const amazing = simeyHoloShader("amazingRare");
    expect(amazing.backgroundImage).toContain("simey_glitter");
    expect(amazing.mixBlendMode).toBe("normal");
    expect(amazing.overlay).toBe("amazingRareFoil");
    expect(amazing.carve?.url).toContain("Galaxy_Stars");
    expect(simeyHoloShader("amazingRareFoil").mixBlendMode).toBe("lighten");
    expect(simeyHoloShader("amazingRareFoil").backgroundImage).toContain(
      "var(--foil-etch",
    );
    expect(simeyHoloShader("amazingRareFoil").overlay).toBe("amazingRareCoat");
    expect(simeyHoloShader("amazingRareCoat").mixBlendMode).toBe("saturation");
    expect(simeyHoloShader("exRegular").backgroundImage).toContain(
      "simey_grain",
    );
    const secret = simeyHoloShader("secretRare");
    expect(secret.backgroundImage).toContain("FX_T_Spectrum_SVHolo2");
    expect(secret.backgroundImage).toContain("FX_T_SVUltra_Glitter");
    expect(secret.backgroundImage).toContain("conic-gradient");
    expect(secret.backgroundImage).toMatch(/hsl\(93,/); // green in sunpillar
    expect(secret.backgroundPosition).toContain("var(--background-y");
    expect(secret.mixBlendMode).toBe("color-dodge");
    expect(secret.opacity).toBe(0.4);
    expect(secret.overlay).toBe("secretRareCoat");
    const secretCoat = simeyHoloShader("secretRareCoat");
    expect(secretCoat.backgroundImage).toContain("var(--foil-etch");
    expect(secretCoat.backgroundImage).not.toContain("var(--foil-cold");
    expect(secretCoat.backgroundImage).toContain("FX_T_Highlight_Gold_Band");
    expect(secretCoat.backgroundImage).toContain("linear-gradient(45deg");
    expect(secretCoat.mixBlendMode).toBe("soft-light");
    expect(secretCoat.opacity).toBe(0.55);
    expect(secretCoat.clipPath).toBeUndefined();
    expect(secretCoat.overlay).toBe("secretRareSparkle");
    const sparkle = simeyHoloShader("secretRareSparkle");
    expect(sparkle.mixBlendMode).toBe("overlay");
    expect(sparkle.backgroundImage).toContain("FX_T_SVUltra_Glitter");
    expect(sparkle.opacity).toBe(0.28);
    expect(sparkle.clipPath).toBeUndefined();
    expect(simeyHoloShader("pokeBallHolo").carve?.url).toContain("TEX_CC_PB");
    expect(simeyHoloShader("pokeBallHolo").backgroundImage).toContain(
      "FX_T_Spectrum_FlatSilver",
    );
    expect(simeyHoloShader("vRegular").backgroundImage).toContain(
      "FX_T_Spectrum_Bands_Vertical",
    );
    expect(simeyHoloShader("illustrationRare").carve?.url).toContain(
      "Cracked_Ice",
    );
    expect(simeyHoloShader("vRegular").overlay).toBe("vRegularCoat");
    expect(simeyHoloShader("exFullArt").overlay).toBe("exFullArtCoat");
    expect(simeyHoloShader("exFullArt").backgroundImage).toContain(
      "simey_illusion",
    );
    expect(simeyHoloShader("exFullArt").backgroundImage).toMatch(/128\.5deg/);
    expect(simeyHoloShader("exFullArt").filter).toContain("contrast(2.5)");
    // Live mask is clip-only — blend stack keeps a neutral white soft-light
    // stand-in (not var(--foil-mask) — Live masks crush sunpillar chroma).
    expect(simeyHoloShader("exFullArt").backgroundImage).toContain(
      "linear-gradient(#ffffff, #ffffff)",
    );
    expect(simeyHoloShader("exFullArt").backgroundImage).not.toContain(
      "--foil-mask",
    );
    expect(simeyHoloShader("exFullArt").backgroundSize).toContain(
      "var(--foil-imgsize, 33%)",
    );
    // SvHolo / v-star: soft-light coat + same rib pan (opposite mid-cuts).
    const vStar = simeyHoloShader("vStar");
    expect(vStar.backgroundImage).toContain("simey_grain");
    expect(vStar.backgroundImage).toMatch(/repeating-linear-gradient\(\s*0deg/);
    expect(vStar.backgroundImage).not.toContain("FX_T_Spectrum_SVHolo2");
    expect(vStar.backgroundImage).not.toContain("FX_T_Spectrum_SVHolo3");
    expect(vStar.backgroundSize).toContain("200% 700%");
    expect(vStar.overlay).toBe("vStarCoat");
    const vStarCoat = simeyHoloShader("vStarCoat");
    expect(vStarCoat.mixBlendMode).toBe("soft-light");
    expect(vStarCoat.backgroundImage).toMatch(/repeating-linear-gradient\(\s*0deg/);
    expect(vStarCoat.backgroundPosition).toBe(vStar.backgroundPosition);
    expect(vStarCoat.backgroundPosition).not.toMatch(/\*\s*-1\)/);
    // Tinsel / shiny-rare: sunpillar + soft-light coat, same pan.
    const shiny = simeyHoloShader("shinyRare");
    expect(shiny.backgroundImage).toMatch(/repeating-linear-gradient\(\s*0deg/);
    expect(shiny.backgroundImage).not.toContain("FX_T_Spectrum_FlatSilver");
    expect(shiny.overlay).toBe("shinyRareCoat");
    const shinyCoat = simeyHoloShader("shinyRareCoat");
    expect(shinyCoat.mixBlendMode).toBe("soft-light");
    expect(shinyCoat.backgroundImage).toMatch(/repeating-linear-gradient\(\s*0deg/);
    expect(shinyCoat.backgroundSize).toContain("200% 400%");
    expect(shinyCoat.backgroundPosition).toBe(shiny.backgroundPosition);
    expect(shinyCoat.backgroundPosition).not.toMatch(/\*\s*-1\)/);
  });
});
