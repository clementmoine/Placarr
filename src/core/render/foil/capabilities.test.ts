import { afterEach, describe, expect, it, vi } from "vitest";

import {
  astcFormatConstant,
  foilForceRasterOverride,
  foilRenderScale,
  FOIL_SHARP_WIDTH_PX,
  getFoilCapabilities,
  preferAstcTextureUpload,
  probeFoilCapabilities,
  resetFoilCapabilitiesForTests,
} from "./capabilities";

describe("foil capabilities probe", () => {
  afterEach(() => {
    resetFoilCapabilitiesForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports no WebGL when document is unavailable", () => {
    vi.stubGlobal("document", undefined);
    expect(probeFoilCapabilities()).toEqual({
      supportsWebgl2: false,
      supportsAstc: false,
    });
  });

  it("reports no WebGL when webgl2 context creation fails", () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => null,
      }),
    });
    expect(probeFoilCapabilities()).toEqual({
      supportsWebgl2: false,
      supportsAstc: false,
    });
  });

  it("reports WebGL2 without ASTC when the extension is missing", () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({
          getExtension: () => null,
        }),
      }),
    });
    expect(probeFoilCapabilities()).toEqual({
      supportsWebgl2: true,
      supportsAstc: false,
    });
  });

  it("reports ASTC when the compressed-texture extension is present", () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({
          getExtension: (name: string) =>
            name === "WEBGL_compressed_texture_astc"
              ? { COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0 }
              : null,
        }),
      }),
    });
    expect(probeFoilCapabilities()).toEqual({
      supportsWebgl2: true,
      supportsAstc: true,
    });
  });

  it("probes only once until reset", () => {
    const getContext = vi.fn(() => ({
      getExtension: () => null,
    }));
    vi.stubGlobal("document", {
      createElement: () => ({ getContext }),
    });

    probeFoilCapabilities();
    probeFoilCapabilities();
    expect(getContext).toHaveBeenCalledTimes(1);

    resetFoilCapabilitiesForTests();
    getFoilCapabilities();
    expect(getContext).toHaveBeenCalledTimes(2);
  });
});

describe("astcFormatConstant", () => {
  it("returns the GL enum for a known format name", () => {
    const gl = {
      getExtension: () => ({
        COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0,
        COMPRESSED_RGBA_ASTC_8x8_KHR: 0x93b7,
      }),
    } as unknown as WebGL2RenderingContext;

    expect(astcFormatConstant(gl, "COMPRESSED_RGBA_ASTC_4x4_KHR")).toBe(0x93b0);
    expect(astcFormatConstant(gl, "COMPRESSED_RGBA_ASTC_8x8_KHR")).toBe(0x93b7);
  });

  it("returns null when the extension or name is missing", () => {
    const gl = {
      getExtension: () => null,
    } as unknown as WebGL2RenderingContext;
    expect(astcFormatConstant(gl, "COMPRESSED_RGBA_ASTC_4x4_KHR")).toBeNull();

    const glWithExt = {
      getExtension: () => ({ COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0 }),
    } as unknown as WebGL2RenderingContext;
    expect(astcFormatConstant(glWithExt, "UNKNOWN_FORMAT")).toBeNull();
  });
});

describe("preferAstcTextureUpload", () => {
  it("prefers ASTC when GPU + dump + raster sibling are present", () => {
    expect(
      preferAstcTextureUpload({
        hasAstcBinding: true,
        hasRasterSibling: true,
        supportsAstc: true,
      }),
    ).toBe(true);
  });

  it("falls through to RGBA/WebP when ASTC is unsupported", () => {
    expect(
      preferAstcTextureUpload({
        hasAstcBinding: true,
        hasRasterSibling: true,
        supportsAstc: false,
      }),
    ).toBe(false);
  });

  it("falls through when the dump has no raster sibling", () => {
    expect(
      preferAstcTextureUpload({
        hasAstcBinding: true,
        hasRasterSibling: false,
        supportsAstc: true,
      }),
    ).toBe(false);
  });

  it("honours placarrForceFoilRaster smoke override", () => {
    expect(
      preferAstcTextureUpload({
        hasAstcBinding: true,
        hasRasterSibling: true,
        supportsAstc: true,
        forceRaster: true,
      }),
    ).toBe(false);
  });
});

describe("foilForceRasterOverride", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads localStorage placarrForceFoilRaster=1", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "placarrForceFoilRaster" ? "1" : null,
    });
    expect(foilForceRasterOverride()).toBe(true);
  });

  it("is false when localStorage is missing or unset", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(foilForceRasterOverride()).toBe(false);
  });
});

describe("foilRenderScale", () => {
  it("renders a grid thumbnail one device pixel per CSS pixel", () => {
    // Measured cause: a 107px tile at x2 cost four times the fill for rules
    // text about four pixels tall.
    expect(foilRenderScale(107, 2)).toBe(1);
    expect(foilRenderScale(107, 3)).toBe(1);
  });

  it("keeps full sharpness on a card being looked at", () => {
    expect(foilRenderScale(513, 2)).toBe(2);
    expect(foilRenderScale(220, 2)).toBe(2);
  });

  it("allows up to x3 on a denser screen, never above", () => {
    // Focus foil needs headroom for dFdx-driven spectrum (SunLava); beyond x3
    // the fill cost outweighs any further grace.
    expect(foilRenderScale(513, 3)).toBe(3);
    expect(foilRenderScale(513, 4)).toBe(3);
  });

  it("never goes below 1; focus supersamples even at DPR 1", () => {
    // Sub-sampling a card is visible even in a thumbnail.
    expect(foilRenderScale(107, 0.75)).toBe(1);
    // 280px stack at DPR 1 used to blob SunLava — floor at x2 for sharp cards.
    expect(foilRenderScale(513, 1)).toBe(2);
  });

  it("switches exactly at the threshold, not around it", () => {
    expect(foilRenderScale(FOIL_SHARP_WIDTH_PX - 1, 2)).toBe(1);
    expect(foilRenderScale(FOIL_SHARP_WIDTH_PX, 2)).toBe(2);
  });
});
