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
    (Record<string, number> & { COMPRESSED_RGBA_ASTC_4x4_KHR?: number }) | null;
  if (!ext) return null;

  const value = ext[formatName];
  return typeof value === "number" ? value : null;
}

/**
 * Prefer ASTC dump over raster WebP/PNG when the GPU supports it.
 * `forceRaster` (smoke: `localStorage.placarrForceFoilRaster=1`) always
 * falls through to the lossless raster path for Network debugging.
 */
export function preferAstcTextureUpload(opts: {
  hasAstcBinding: boolean;
  /** Raster sibling exists (binding.file) — ASTC alone is not enough. */
  hasRasterSibling: boolean;
  supportsAstc: boolean;
  forceRaster?: boolean;
}): boolean {
  return (
    opts.hasAstcBinding &&
    opts.hasRasterSibling &&
    opts.supportsAstc &&
    !opts.forceRaster
  );
}

/** Read the smoke override; safe when `localStorage` is missing. */
export function foilForceRasterOverride(): boolean {
  try {
    return globalThis.localStorage?.getItem("placarrForceFoilRaster") === "1";
  } catch {
    return false;
  }
}

/**
 * WebGL2 internal format for a foil texture upload.
 *
 * Live (Pokémon) sheets are authored Linear: sample sRGB→linear when the
 * binding opts in (`srgb`) and the material sets `linearOutput`, then the
 * fragment path OETF-encodes. Lorcana / Gamma dumps keep raw RGBA bytes.
 */
export function foilTextureInternalFormat(opts: {
  linearOutput?: boolean;
  srgb?: boolean;
}): "srgb8_alpha8" | "rgba" {
  return opts.srgb && opts.linearOutput ? "srgb8_alpha8" : "rgba";
}

/** Frag prep: Linear packs need OETF encode; Gamma packs leave GLSL as-is. */
export function foilFragmentNeedsLinearEncode(
  linearOutput?: boolean,
): boolean {
  return Boolean(linearOutput);
}

export { ASTC_FORMAT_NAMES };

/**
 * How many device pixels to render per CSS pixel, for a card of this width.
 *
 * The renderer composites the artwork itself — the `<img>` beside it is held at
 * `opacity-0` and only carries the alt text and the natural ratio — so this is
 * the resolution of the whole card, rules text included. That is why it cannot
 * simply be 1 everywhere.
 *
 * But a grid tile measures ~107 CSS pixels across, where the rules text is
 * around 4px tall and unreadable at any sampling. Rendering it at ×2 cost four
 * times the fill for detail nobody can resolve: measured at 38 Mpixels/s across
 * ten tiles, with the page already at 42fps on a desktop GPU.
 *
 * So: full sharpness where a card is actually being looked at, and one device
 * pixel per CSS pixel for thumbnails. The threshold is a judgement — a card
 * wider than this is one you are reading, narrower is one you are scanning past
 * — and it is deliberately below the fullscreen and detail-hero sizes.
 */
export const FOIL_SHARP_WIDTH_PX = 200;

export function foilRenderScale(
  cssWidth: number,
  devicePixelRatio: number,
): number {
  // Never below 1: sub-sampling a card is visible even in a thumbnail.
  // Focus/stack cards supersample at least ×2 even when DPR is 1 — Live
  // HoloFoil frags (SunLava) drive spectrum UVs from dFdx/dFdy; a 280px
  // buffer turns the lava into thick blobs.
  if (cssWidth >= FOIL_SHARP_WIDTH_PX) {
    return Math.max(2, Math.min(devicePixelRatio, 3));
  }
  return Math.max(1, Math.min(devicePixelRatio, 1));
}
