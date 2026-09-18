import { afterEach, describe, expect, it, vi } from "vitest";

import {
  astcFormatConstant,
  foilRenderScale,
  FOIL_SHARP_WIDTH_PX,
  getFoilCapabilities,
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

  it("caps at 2 even on a denser screen", () => {
    // Beyond x2 the extra fill buys nothing visible and costs quadratically.
    expect(foilRenderScale(513, 3)).toBe(2);
    expect(foilRenderScale(513, 4)).toBe(2);
  });

  it("never goes below 1, whatever the screen claims", () => {
    // Sub-sampling a card is visible even in a thumbnail.
    expect(foilRenderScale(107, 0.75)).toBe(1);
    expect(foilRenderScale(513, 1)).toBe(1);
  });

  it("switches exactly at the threshold, not around it", () => {
    expect(foilRenderScale(FOIL_SHARP_WIDTH_PX - 1, 2)).toBe(1);
    expect(foilRenderScale(FOIL_SHARP_WIDTH_PX, 2)).toBe(2);
  });
});
