import { afterEach, describe, expect, it, vi } from "vitest";

import {
  astcFormatConstant,
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

    expect(astcFormatConstant(gl, "COMPRESSED_RGBA_ASTC_4x4_KHR")).toBe(
      0x93b0,
    );
    expect(astcFormatConstant(gl, "COMPRESSED_RGBA_ASTC_8x8_KHR")).toBe(
      0x93b7,
    );
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
