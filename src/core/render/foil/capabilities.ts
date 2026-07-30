export type FoilCapabilities = {
  supportsWebgl2: boolean;
  supportsAstc: boolean;
};

let cached: FoilCapabilities | null = null;

/** Known ASTC format constant names from WEBGL_compressed_texture_astc. */
const ASTC_FORMAT_NAMES = [
  "COMPRESSED_RGBA_ASTC_4x4_KHR",
  "COMPRESSED_RGBA_ASTC_5x4_KHR",
  "COMPRESSED_RGBA_ASTC_5x5_KHR",
  "COMPRESSED_RGBA_ASTC_6x5_KHR",
  "COMPRESSED_RGBA_ASTC_6x6_KHR",
  "COMPRESSED_RGBA_ASTC_8x5_KHR",
  "COMPRESSED_RGBA_ASTC_8x6_KHR",
  "COMPRESSED_RGBA_ASTC_8x8_KHR",
  "COMPRESSED_RGBA_ASTC_10x5_KHR",
  "COMPRESSED_RGBA_ASTC_10x6_KHR",
  "COMPRESSED_RGBA_ASTC_10x8_KHR",
  "COMPRESSED_RGBA_ASTC_10x10_KHR",
  "COMPRESSED_RGBA_ASTC_12x10_KHR",
  "COMPRESSED_RGBA_ASTC_12x12_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR",
  "COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR",
] as const;

function probeOnce(): FoilCapabilities {
  if (typeof document === "undefined") {
    return { supportsWebgl2: false, supportsAstc: false };
  }

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return { supportsWebgl2: false, supportsAstc: false };
  }

  const ext = gl.getExtension("WEBGL_compressed_texture_astc");
  return {
    supportsWebgl2: true,
    supportsAstc: ext !== null,
  };
}

export function probeFoilCapabilities(): FoilCapabilities {
  cached ??= probeOnce();
  return cached;
}

export function getFoilCapabilities(): FoilCapabilities {
  return probeFoilCapabilities();
}

export function resetFoilCapabilitiesForTests(): void {
  cached = null;
}

/**
 * Resolve an ASTC compressed-format GL enum from the extension constant name.
 * Returns null when the extension is missing or the name is unknown.
 */
export function astcFormatConstant(
  gl: WebGL2RenderingContext,
  formatName: string,
): number | null {
  const ext = gl.getExtension("WEBGL_compressed_texture_astc") as
    | (Record<string, number> & { COMPRESSED_RGBA_ASTC_4x4_KHR?: number })
    | null;
  if (!ext) return null;

  const value = ext[formatName];
  return typeof value === "number" ? value : null;
}

export { ASTC_FORMAT_NAMES };
