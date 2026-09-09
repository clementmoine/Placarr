import {
  fetchArrayBuffer,
  fetchFragmentSource,
  fetchImageBitmap,
} from "@/core/render/foil/cache";
import {
  astcFormatConstant,
  getFoilCapabilities,
} from "@/core/render/foil/capabilities";
import { foilClockSeconds, subscribeFoilFrame } from "../clock";

import type {
  FoilAstcBinding,
  FoilFilter,
  FoilMaterial,
  FoilTextureBinding,
  FoilWrap,
} from "@/core/render/foil/types";
import { hotFoilStampUniforms } from "@/core/render/foil/hotFoilStamp";
import { cameraPosFromTilt, lightDirectionFromTilt } from "./lightDirection";

import type {
  WebglFoilRenderer,
  WebglFoilScrollMode,
  WebglFoilSurfaces,
} from "./webglTypes";

export type {
  WebglFoilRenderer,
  WebglFoilScrollMode,
  WebglFoilSurfaces,
} from "./webglTypes";

/**
 * The mobile app's own foil shaders, run in the browser.
 *
 * Fragment programs under `${assetBase}/shaders/` are extracted from the app's
 * GLES3 build — the exact GLSL dialect WebGL2 speaks. This file supplies what
 * the engine supplied around them: a quad, the material's recorded uniforms,
 * and the two scroll drivers (`_SCROLLMODE_TIME` at rest, `_SCROLLMODE_TILT`
 * under the pointer / gyroscope).
 *
 * Everything here is name-driven off the program's own reflection
 * (`getActiveUniform`): the renderer knows no shader by name and carries no
 * per-effect logic.
 */

/**
 * Live `Card` mesh width/height (`data/pokemon/foil/card-uv-rect.json`). Portrait
 * UVs are not isometric: equal Δu/Δv map to unequal millimetres.
 */
export const LIVE_CARD_ASPECT = 0.7187859711391763;

/**
 * Full-screen quad → UVs, plus Unity card varyings.
 * Lorcana frags read `vs_INTERP*`; TCG Live HoloFoil reads `vs_TEXCOORD*`
 * (TBN rows + world pos.w from the Live VS).
 *
 * `u_CardLean` tips the TBN like Live rotating the Card mesh. Without it,
 * AceFoil's CrossTexture lattice (driven by WorldToObject·N → TBN dots) stays
 * frozen — CSS only spins the canvas; clip-space geometry stayed flat.
 */
const VERTEX_SRC = `#version 300 es
layout(location = 0) in vec2 position;
uniform vec2 u_CardLean;
out highp vec4 vs_INTERP0;
out highp vec4 vs_INTERP2;
out highp vec2 vs_TEXCOORD0;
out highp vec4 vs_TEXCOORD1;
out highp vec4 vs_TEXCOORD2;
out highp vec4 vs_TEXCOORD3;
void main() {
  vec2 uv = position * 0.5 + 0.5;
  vs_INTERP0 = vec4(uv, 0.0, 0.0);
  vs_INTERP2 = vec4(1.0);
  vs_TEXCOORD0 = uv;
  // Unity packing: TEXCOORD<i> = (T.<i>, B.<i>, N.<i>, worldPos.<i>) —
  // frags read normal as (T1.z, T2.z, T3.z), worldPos as (T1.w, T2.w, T3.w).
  // Rest lean: T=(1,0,0), B=(0,0,1), N=(0,1,0) — same as MAT _LightDirection.
  //
  // worldPos must vary across the card: Live's HoloFoil frags derive a
  // per-pixel view offset from dFdx/dFdy of it — a constant leaves
  // inversesqrt(0) = ∞ and NaN shine/spectrum UVs (no gold-rainbow sweep).
  // Tip local XZ with the same TBN so etch-view + lattice track the lean.
  vec3 N = normalize(vec3(u_CardLean.x, 1.0, u_CardLean.y));
  vec3 T = vec3(1.0, 0.0, 0.0) - N * N.x;
  float tLen = length(T);
  T = tLen > 1e-4 ? T / tLen : normalize(cross(vec3(0.0, 0.0, 1.0), N));
  vec3 B = cross(T, N);
  vec3 local = vec3((uv.x - 0.5) * ${LIVE_CARD_ASPECT}, 0.0, (0.5 - uv.y) * 1.0);
  vec3 worldPos = T * local.x + B * local.z;
  vs_TEXCOORD1 = vec4(T.x, B.x, N.x, worldPos.x);
  vs_TEXCOORD2 = vec4(T.y, B.y, N.y, worldPos.y);
  vs_TEXCOORD3 = vec4(T.z, B.z, N.z, worldPos.z);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile: ${log}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  fragmentSrc: string,
): WebGLProgram {
  const linked = gl.createProgram();
  if (!linked) throw new Error("createProgram failed");
  gl.attachShader(linked, compile(gl, gl.VERTEX_SHADER, VERTEX_SRC));
  gl.attachShader(linked, compile(gl, gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(linked)}`);
  }
  return linked;
}

/**
 * Unity's `_CosTime`: `(cos(t/8), cos(t/4), cos(t/2), cos(t))` with `t` in
 * seconds — what the Time-scroll fragments read as their light driver.
 */
export function foilCosTime(
  seconds: number,
): readonly [number, number, number, number] {
  return [
    Math.cos(seconds / 8),
    Math.cos(seconds / 4),
    Math.cos(seconds / 2),
    Math.cos(seconds),
  ];
}

/**
 * Unity card fragments finish with α = 1/255 and RGB already multiplied by it —
 * an encoding the app's blit undoes when it composites the render target. The
 * browser paints the canvas as-is, so that α lets the tile behind
 * (`bg-white` / edge gradient) bleed through as washed horizontal bands exactly
 * where the foil mask is dense.
 *
 * Restore a normal opaque colour before link.
 */
export function restoreOpaqueFoilOutput(source: string): string {
  if (!source.includes("0.00392156886")) return source;
  return source.replace(
    /SV_TARGET0\.xyz = (\w+)\.www \* \1\.xyz;\s*SV_TARGET0\.w = \1\.w;/g,
    "SV_TARGET0.xyz = $1.xyz;\n    SV_TARGET0.w = 1.0;",
  );
}

/**
 * Square / isotropic motifs (`TEX_CC_PB`, stars, confetti dots, Radiant cross
 * lattice, …) are authored for equal UV scales. Live frags use `vec2(s, s)`,
 * which stretches them tall on the portrait card. CSS tiles in square pixels;
 * scale.x *= aspect so WebGL matches that isotropy.
 *
 * - `_Tex_CC` / stars / dots: equal `vs_TEXCOORD0` tilings near `texture(…)`.
 * - `_CrossTexture` / Squares direction: lattice math sits between scale and
 *   sample — rewrite every equal `vs_TEXCOORD0.xy * vec2(s,s)` in those frags.
 */
export function aspectCorrectSquareMotifUv(
  source: string,
  aspect: number = LIVE_CARD_ASPECT,
): string {
  if (!(aspect > 0)) return source;
  const hasCc = source.includes("_Tex_CC");
  const hasStarDot =
    source.includes("_StarsTexture") ||
    source.includes("_TexDots") ||
    source.includes("_T_noise_dots");
  const hasCross = source.includes("_CrossTexture");
  const hasSquareDir = source.includes("_T_Direction_RGB_Random");
  if (!hasCc && !hasStarDot && !hasCross && !hasSquareDir) return source;

  const motifSampler = "_Tex_CC(?!_)|_StarsTexture|_TexDots|_T_noise_dots";

  // Equal vec2 → earliest texture(motif) within the next 1–3 lines.
  // Non-greedy so two back-to-back CC samples (SunPillar) each match once.
  let out = source.replace(
    new RegExp(
      String.raw`vs_TEXCOORD0\.xy \* vec2\(([0-9.eE+-]+),\s*\1\)((?:[^\n]*\n){1,3}?[^\n]*texture\((${motifSampler}))`,
      "g",
    ),
    (_match, scale: string, tail: string) => {
      const s = Number(scale);
      if (!Number.isFinite(s)) return _match;
      return `vs_TEXCOORD0.xy * vec2(${s * aspect}, ${s})${tail}`;
    },
  );

  // Radiant / Ace cross lattice and Squares grid: scale is followed by rotate /
  // trunc math, not an immediate texture(). Rewrite every equal TEXCOORD0 pair
  // (`vec2(s,s)` → unequal args, so a second pass is a no-op).
  if (hasCross || hasSquareDir) {
    out = out.replace(
      /vs_TEXCOORD0\.xy \* vec2\(([0-9.eE+-]+),\s*\1\)/g,
      (_match, scale: string) => {
        const s = Number(scale);
        if (!Number.isFinite(s)) return _match;
        return `vs_TEXCOORD0.xy * vec2(${s * aspect}, ${s})`;
      },
    );
  }

  if (!hasStarDot && !hasCross) return out;

  // Equal vec4 xyxy — Cosmos / Galaxy star grids; Ace cross quantize.
  out = out.replace(
    /vs_TEXCOORD0\.xyxy \* vec4\(([0-9.eE+-]+),\s*\1,\s*\1,\s*\1\)/g,
    (_match, scale: string) => {
      const s = Number(scale);
      if (!Number.isFinite(s)) return _match;
      return `vs_TEXCOORD0.xyxy * vec4(${s * aspect}, ${s}, ${s * aspect}, ${s})`;
    },
  );

  // Paired equals `vec4(sx,sx,sz,sz)` — CrackedIce stars / Ace 192×256 grid.
  out = out.replace(
    /vs_TEXCOORD0\.xyxy \* vec4\(([0-9.eE+-]+),\s*\1,\s*([0-9.eE+-]+),\s*\2\)/g,
    (_match, sx: string, sz: string) => {
      const a = Number(sx);
      const b = Number(sz);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return _match;
      // Already rewritten all-equal form keeps sx===sz numerically after
      // aspect on x — skip if this still looks like the all-equal rewrite.
      if (a === b * aspect || b === a * aspect) return _match;
      return `vs_TEXCOORD0.xyxy * vec4(${a * aspect}, ${a}, ${b * aspect}, ${b})`;
    },
  );

  return out;
}

/**
 * @deprecated Prefer {@link aspectCorrectSquareMotifUv} — same CC path, kept
 * as a named export for existing tests.
 */
export function aspectCorrectSquareCcUv(
  source: string,
  aspect: number = LIVE_CARD_ASPECT,
): string {
  return aspectCorrectSquareMotifUv(source, aspect);
}

/**
 * Identity columns for a `hlslcc_mtx4x4unity_*` vec4-array uniform.
 *
 * GL lists the whole array as one active uniform `name[0]` whose `size` is the
 * element count: a single `uniform4f` write fills only column `first` and
 * leaves the rest at zero — the frags' `normalize(WorldToObject · n)` then
 * hits `inversesqrt(0)` = NaN and takes whole effect stages with it (Live's
 * gold-rainbow spectrum sampled a corner texel through NaN UVs).
 */
export function identityMatrixColumns(first: number, size: number): number[] {
  const identity = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ] as const;
  const cols = Math.max(size, 1);
  const data: number[] = [];
  for (let c = 0; c < cols; c++) {
    data.push(...(identity[first + c] ?? [0, 0, 0, 0]));
  }
  return data;
}

/**
 * Unity Linear pipeline: the fragment emits linear colour and the app's sRGB
 * framebuffer encodes it in hardware. WebGL2's default framebuffer stores the
 * value raw, so the encode has to live in the shader — wrap `main` and apply
 * the exact sRGB OETF to the colour output (alpha stays linear coverage).
 *
 * No-op when the fragment's output declaration is not found.
 */
export function encodeLinearFoilOutput(source: string): string {
  const out = /layout\(location = 0\) out \w+ vec4 (\w+);/.exec(source);
  if (!out || !source.includes("void main()")) return source;
  const target = out[1];
  return (
    source.replace("void main()", "void foil_linear_main()") +
    `
void main() {
  foil_linear_main();
  vec3 lin = max(${target}.xyz, vec3(0.0));
  ${target}.xyz = mix(
    lin * 12.92,
    1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055,
    step(vec3(0.0031308), lin)
  );
}
`
  );
}

const WRAP_GL: Record<FoilWrap, number> = {
  repeat: 0,
  clamp: 0,
  mirror: 0,
  mirrorOnce: 0,
};

function wrapMode(
  gl: WebGL2RenderingContext,
  wrap: FoilWrap | undefined,
): number {
  switch (wrap) {
    case "clamp":
      return gl.CLAMP_TO_EDGE;
    case "mirror":
    case "mirrorOnce":
      return gl.MIRRORED_REPEAT;
    case "repeat":
    default:
      return gl.REPEAT;
  }
}

function minFilter(
  gl: WebGL2RenderingContext,
  filter: FoilFilter | undefined,
  mipmaps: boolean | undefined,
): number {
  if (!mipmaps) {
    return filter === "point" ? gl.NEAREST : gl.LINEAR;
  }
  if (filter === "trilinear") return gl.LINEAR_MIPMAP_LINEAR;
  if (filter === "point") return gl.NEAREST_MIPMAP_NEAREST;
  return gl.LINEAR_MIPMAP_NEAREST;
}

function magFilter(
  gl: WebGL2RenderingContext,
  filter: FoilFilter | undefined,
): number {
  return filter === "point" ? gl.NEAREST : gl.LINEAR;
}

const ROLE_FALLBACK: Record<string, [number, number, number, number]> = {
  art: [128, 128, 128, 255],
  foilMask: [255, 255, 255, 255],
  varnishMask: [0, 0, 0, 255],
  secondVarnishMask: [0, 0, 0, 255],
  normals: [128, 128, 255, 255],
};

/**
 * Unbound motif / optional slots (Unity pathid 0) must sample as transparent.
 * Opaque black (α=255) falsely arms alpha-gated layers — e.g. FlatSilver keeps
 * `_UseCCFoil=1` and `_Tex_CC_Spectrum=SVHolo2` while `_Tex_CC` is unbound; Live
 * null-textures α≈0 so the CC rainbow stays off, but α=1 lit the whole card.
 */
export const UNBOUND_TEXTURE_FALLBACK: [number, number, number, number] = [
  0, 0, 0, 0,
];

function recoverFoilMaskRgb(
  image: ImageBitmap,
): ImageBitmap | Promise<ImageBitmap> {
  const probe = document.createElement("canvas");
  probe.width = Math.min(image.width, 64);
  probe.height = Math.min(image.height, 64);
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0, probe.width, probe.height);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  let whiteRgb = 0;
  let alphaMin = 255;
  let alphaMax = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) whiteRgb += 1;
    alphaMin = Math.min(alphaMin, data[i + 3]);
    alphaMax = Math.max(alphaMax, data[i + 3]);
  }
  const pixels = data.length / 4;
  const alphaVary = alphaMax - alphaMin;
  if (whiteRgb / pixels < 0.9 || alphaVary < 40) return image;

  const full = document.createElement("canvas");
  full.width = image.width;
  full.height = image.height;
  const fullCtx = full.getContext("2d");
  if (!fullCtx) return image;
  fullCtx.drawImage(image, 0, 0);
  const fullData = fullCtx.getImageData(0, 0, full.width, full.height);
  const px = fullData.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    px[i] = a;
    px[i + 1] = a;
    px[i + 2] = a;
  }
  fullCtx.putImageData(fullData, 0, 0);
  return createImageBitmap(full);
}

type ProgramBindings = {
  program: WebGLProgram;
  tiltLoc: WebGLUniformLocation | null;
  /** Tips Live TBN in the VS (AceFoil lattice, etch view, …). */
  cardLeanLoc: WebGLUniformLocation | null;
  /** TCG Live HoloFoil: lean as a front-facing light vector. */
  lightDirLoc: WebGLUniformLocation | null;
  lightDirSize: 3 | 4;
  /** View-dependent frags (SolidColor, …) — moved with lean each draw. */
  cameraPosLoc: WebGLUniformLocation | null;
  cameraPosSize: 3 | 4;
  cosTimeLoc: WebGLUniformLocation | null;
  timeLoc: WebGLUniformLocation | null;
  deviceRotLoc: WebGLUniformLocation | null;
  samplers: { location: WebGLUniformLocation; unit: number; slot: string }[];
};

void WRAP_GL;

function supportsAstcOnContext(gl: WebGL2RenderingContext): boolean {
  return (
    getFoilCapabilities().supportsAstc ||
    gl.getExtension("WEBGL_compressed_texture_astc") !== null
  );
}

/**
 * Smoke / debug: `localStorage.placarrForceFoilRaster = "1"` skips ASTC so the
 * lossless WebP (or PNG) raster path is exercised. Lorcana dumps prefer ASTC
 * on desktop otherwise — WebP never appears in Network.
 */
function forceFoilRaster(): boolean {
  try {
    return globalThis.localStorage?.getItem("placarrForceFoilRaster") === "1";
  } catch {
    return false;
  }
}

export function createWebglFoilRenderer(
  canvas: HTMLCanvasElement,
  material: FoilMaterial,
  surfaces: WebglFoilSurfaces,
  assetBase: string,
): WebglFoilRenderer {
  const gl = canvas.getContext("webgl2", {
    premultipliedAlpha: true,
    alpha: true,
  });
  if (!gl || gl.isContextLost()) {
    throw new Error("WebGL2 indisponible");
  }

  const shaderBase = `${assetBase}/shaders/`;
  const textureBase = `${assetBase}/textures/`;

  let tiltProgram: ProgramBindings | null = null;
  let timeProgram: ProgramBindings | null = null;
  let active: ProgramBindings | null = null;
  // Always start on the clock. Live single-frag (Pokémon) reads `_Time` in the
  // same program — defaulting to `"tilt"` left `_Time` frozen until React
  // flipped the mode (and foil looked dead / stuck after hover). Lorcana
  // dual-frag also wants Time at rest; hover swaps via setScrollMode.
  let scrollMode: WebglFoilScrollMode = "time";
  let destroyed = false;
  let frame = 0;
  let paused = document.visibilityState === "hidden";
  let tilt: readonly [number, number] = [0, 0];
  let deviceRotation = material.floats._DeviceRotationDegrees ?? 0;
  /**
   * Unsubscribe from the shared clock, when this renderer is animating.
   *
   * The origin is the clock's, not ours: cards created seconds apart while
   * scrolling used to shimmer out of phase, because each captured its own.
   */
  let unsubscribeClock: (() => void) | null = null;
  const texturesBySlot = new Map<string, WebGLTexture>();

  function onVisibilityChange() {
    paused = document.visibilityState === "hidden";
    if (paused) {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      syncClock();
      return;
    }
    if (scrollMode === "time" && active) scheduleDraw();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);

  function solidTexture(rgba: [number, number, number, number]): WebGLTexture {
    const texture = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      1,
      1,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      new Uint8Array(rgba),
    );
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return texture!;
  }

  function applySamplerState(
    binding: FoilTextureBinding | undefined,
    options: { compressed?: boolean } = {},
  ): void {
    const isRole = Boolean(binding?.role);
    const wrap = isRole ? "clamp" : (binding?.wrap ?? "repeat");
    // Compressed ASTC dumps are level-0 only — generateMipmap is illegal on
    // them, and a mip minFilter without a chain samples black.
    const mipmaps = !options.compressed && !isRole && Boolean(binding?.mipmaps);
    const filter = binding?.filter ?? "bilinear";
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, wrapMode(gl!, wrap));
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, wrapMode(gl!, wrap));
    gl!.texParameteri(
      gl!.TEXTURE_2D,
      gl!.TEXTURE_MIN_FILTER,
      minFilter(gl!, filter, mipmaps),
    );
    gl!.texParameteri(
      gl!.TEXTURE_2D,
      gl!.TEXTURE_MAG_FILTER,
      magFilter(gl!, filter),
    );
    if (mipmaps) gl!.generateMipmap(gl!.TEXTURE_2D);
  }

  function uploadTexture(
    image: ImageBitmap,
    binding: FoilTextureBinding | undefined,
  ): WebGLTexture {
    const texture = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      // sRGB-authored textures decode to linear on sample (filtering included),
      // matching how the app's Linear pipeline reads them.
      binding?.srgb ? gl!.SRGB8_ALPHA8 : gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      image,
    );
    applySamplerState(binding);
    return texture!;
  }

  function uploadCompressedTexture(
    data: ArrayBuffer,
    astc: FoilAstcBinding,
    binding: FoilTextureBinding | undefined,
  ): WebGLTexture | null {
    const format = astcFormatConstant(gl!, astc.format);
    if (format === null) return null;

    const texture = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    try {
      while (gl!.getError() !== gl!.NO_ERROR) {
        /* drain stale errors */
      }
      gl!.compressedTexImage2D(
        gl!.TEXTURE_2D,
        0,
        format,
        astc.width,
        astc.height,
        0,
        new Uint8Array(data),
      );
      if (gl!.getError() !== gl!.NO_ERROR) {
        gl!.deleteTexture(texture);
        return null;
      }
      applySamplerState(binding, { compressed: true });
      return texture;
    } catch {
      gl!.deleteTexture(texture);
      return null;
    }
  }

  function textureUrl(slot: string): string | null {
    const binding = material.textures[slot];
    if (!binding) return null;
    if (binding.file) return textureBase + binding.file;
    switch (binding.role) {
      case "art":
        return surfaces.artUrl;
      case "foilMask":
        return surfaces.foilMaskUrl ?? null;
      case "varnishMask":
        return surfaces.varnishMaskUrl ?? null;
      case "secondVarnishMask":
        return surfaces.secondVarnishMaskUrl ?? null;
      default:
        return null;
    }
  }

  async function loadSlotTexture(
    slot: string,
    binding: FoilTextureBinding | undefined,
  ): Promise<void> {
    const role = binding?.role;
    const fallback = (role && ROLE_FALLBACK[role]) ?? UNBOUND_TEXTURE_FALLBACK;
    texturesBySlot.set(
      slot,
      solidTexture(fallback as [number, number, number, number]),
    );

    if (
      binding?.astc &&
      binding.file &&
      !role &&
      !forceFoilRaster() &&
      supportsAstcOnContext(gl!)
    ) {
      try {
        const data = await fetchArrayBuffer(textureBase + binding.astc.file);
        if (destroyed) return;
        const compressed = uploadCompressedTexture(data, binding.astc, binding);
        if (compressed) {
          texturesBySlot.set(slot, compressed);
          return;
        }
      } catch {
        // Fall through to PNG.
      }
    }

    const url = textureUrl(slot);
    if (!url) return;

    const image = await fetchImageBitmap(url);
    if (destroyed) return;
    const prepared =
      role === "foilMask" ? await recoverFoilMaskRgb(image) : image;
    if (destroyed) return;
    texturesBySlot.set(slot, uploadTexture(prepared, binding));
  }

  function bindStaticUniforms(program: WebGLProgram): void {
    const uniformCount = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl!.getActiveUniform(program, i);
      if (!info) continue;
      const location = gl!.getUniformLocation(program, info.name);
      if (!location) continue;
      if (
        info.name === "_Tilt" ||
        info.name === "_CosTime" ||
        info.name === "_DeviceRotationDegrees" ||
        info.type === gl!.SAMPLER_2D
      ) {
        continue;
      }

      if (
        surfaces.hotFoilColor &&
        hotFoilStampUniforms(material).has(info.name)
      ) {
        const c = surfaces.hotFoilColor;
        if (info.type === gl!.FLOAT_VEC3) {
          gl!.uniform3f(location, c[0], c[1], c[2]);
        } else if (info.type === gl!.FLOAT_VEC4) {
          gl!.uniform4f(location, c[0], c[1], c[2], c[3] ?? 1);
        }
        continue;
      }
      if (surfaces.secondHotFoilColor && info.name === "_SecondHotFoilColor") {
        const c = surfaces.secondHotFoilColor;
        if (info.type === gl!.FLOAT_VEC3) {
          gl!.uniform3f(location, c[0], c[1], c[2]);
        } else if (info.type === gl!.FLOAT_VEC4) {
          gl!.uniform4f(location, c[0], c[1], c[2], c[3] ?? 1);
        }
        continue;
      }

      const float = material.floats[info.name];
      const color = material.colors[info.name];
      if (info.type === gl!.FLOAT) {
        if (float !== undefined) {
          gl!.uniform1f(location, float);
        } else if (info.name === "_OverallBrightness") {
          // Unity dumps leave brightness in the material sheet; unset → 0
          // blacks every Live HoloFoil leaf.
          gl!.uniform1f(location, 1);
        }
      } else if (info.type === gl!.FLOAT_VEC2 && color) {
        gl!.uniform2f(location, color[0], color[1]);
      } else if (info.type === gl!.FLOAT_VEC3) {
        if (color) {
          gl!.uniform3f(location, color[0], color[1], color[2]);
        } else if (info.name === "_WorldSpaceCameraPos") {
          // Above the card — the app's card lies flat, normal +Y.
          gl!.uniform3f(location, 0, 2, 0);
        }
      } else if (info.type === gl!.FLOAT_VEC4) {
        if (color) {
          gl!.uniform4f(location, color[0], color[1], color[2], color[3]);
        } else if (/_ST$/.test(info.name)) {
          // Unity `*_ST` tiling/offset — identity when the dump sheet omitted it.
          gl!.uniform4f(location, 1, 1, 0, 0);
        } else if (info.name === "_Time" || info.name.startsWith("_Time[")) {
          gl!.uniform4f(location, 0, 0, 0, 0);
        } else if (info.name === "_WorldSpaceCameraPos") {
          gl!.uniform4f(location, 0, 2, 0, 1);
        } else {
          const mtx = info.name.match(
            /^hlslcc_mtx4x4unity_(?:WorldToObject|ObjectToWorld)\[(\d+)\]$/,
          );
          if (mtx) {
            gl!.uniform4fv(
              location,
              identityMatrixColumns(Number(mtx[1]), info.size),
            );
          }
        }
      }
    }
  }

  function collectSamplers(program: WebGLProgram): ProgramBindings["samplers"] {
    const samplers: ProgramBindings["samplers"] = [];
    const names: string[] = [];
    const uniformCount = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl!.getActiveUniform(program, i);
      if (info && info.type === gl!.SAMPLER_2D) names.push(info.name);
    }
    names.sort();
    names.forEach((name, unit) => {
      const location = gl!.getUniformLocation(program, name);
      if (location) samplers.push({ location, unit, slot: name });
    });
    return samplers;
  }

  function vecBinding(
    program: WebGLProgram,
    name: string,
  ): { loc: WebGLUniformLocation | null; size: 3 | 4 } {
    const loc = gl!.getUniformLocation(program, name);
    if (!loc) return { loc: null, size: 3 };
    const count = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl!.getActiveUniform(program, i);
      if (!info || info.name.replace(/\[\d+\]$/, "") !== name) continue;
      if (info.type === gl!.FLOAT_VEC4) return { loc, size: 4 };
      return { loc, size: 3 };
    }
    return { loc, size: 3 };
  }

  function buildBindings(program: WebGLProgram): ProgramBindings {
    gl!.useProgram(program);
    bindStaticUniforms(program);
    const light = vecBinding(program, "_LightDirection");
    const camera = vecBinding(program, "_WorldSpaceCameraPos");
    return {
      program,
      tiltLoc: gl!.getUniformLocation(program, "_Tilt"),
      cardLeanLoc: gl!.getUniformLocation(program, "u_CardLean"),
      lightDirLoc: light.loc,
      lightDirSize: light.size,
      cameraPosLoc: camera.loc,
      cameraPosSize: camera.size,
      cosTimeLoc: gl!.getUniformLocation(program, "_CosTime"),
      timeLoc: gl!.getUniformLocation(program, "_Time"),
      deviceRotLoc: gl!.getUniformLocation(program, "_DeviceRotationDegrees"),
      samplers: collectSamplers(program),
    };
  }

  function draw(seconds = foilClockSeconds()) {
    frame = 0;
    if (destroyed || !active || paused) return;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.useProgram(active.program);

    if (active.tiltLoc) gl!.uniform2f(active.tiltLoc, tilt[0], tilt[1]);
    if (active.cardLeanLoc) {
      gl!.uniform2f(active.cardLeanLoc, tilt[0], tilt[1]);
    }
    if (active.lightDirLoc) {
      const dir = lightDirectionFromTilt(tilt[0], tilt[1]);
      if (active.lightDirSize === 4) {
        gl!.uniform4f(active.lightDirLoc, dir[0], dir[1], dir[2], 0);
      } else {
        gl!.uniform3f(active.lightDirLoc, dir[0], dir[1], dir[2]);
      }
    }
    if (active.cameraPosLoc) {
      const cam = cameraPosFromTilt(tilt[0], tilt[1]);
      if (active.cameraPosSize === 4) {
        gl!.uniform4f(active.cameraPosLoc, cam[0], cam[1], cam[2], 1);
      } else {
        gl!.uniform3f(active.cameraPosLoc, cam[0], cam[1], cam[2]);
      }
    }
    if (active.cosTimeLoc) {
      const cos = foilCosTime(seconds);
      gl!.uniform4f(active.cosTimeLoc, cos[0], cos[1], cos[2], cos[3]);
    }
    if (active.timeLoc) {
      // Unity `_Time`: (t/20, t, t*2, t*3) — Live frags mostly read `.y`.
      gl!.uniform4f(
        active.timeLoc,
        seconds / 20,
        seconds,
        seconds * 2,
        seconds * 3,
      );
    }
    if (active.deviceRotLoc) {
      gl!.uniform1f(active.deviceRotLoc, deviceRotation);
    }

    for (const sampler of active.samplers) {
      gl!.uniform1i(sampler.location, sampler.unit);
      gl!.activeTexture(gl!.TEXTURE0 + sampler.unit);
      const texture = texturesBySlot.get(sampler.slot);
      if (texture) gl!.bindTexture(gl!.TEXTURE_2D, texture);
    }

    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  /** Follow the shared clock while animating; stop the moment we are not. */
  function syncClock() {
    const wants = scrollMode === "time" && !destroyed && !paused && !!active;
    if (wants === Boolean(unsubscribeClock)) return;
    if (wants) {
      unsubscribeClock = subscribeFoilFrame((seconds) => draw(seconds));
      return;
    }
    unsubscribeClock?.();
    unsubscribeClock = null;
  }

  /**
   * A one-off draw, for the tilt path and for state changes.
   *
   * The time path does not go through here — it is driven by the shared clock,
   * which already ticks every frame.
   */
  function scheduleDraw() {
    if (paused) return;
    syncClock();
    if (scrollMode === "time") return;
    if (!frame) frame = requestAnimationFrame(() => draw());
  }

  function activate(mode: WebglFoilScrollMode) {
    const next =
      mode === "time"
        ? (timeProgram ?? tiltProgram)
        : (tiltProgram ?? timeProgram);
    if (!next || next === active) {
      scrollMode = mode;
      scheduleDraw();
      return;
    }
    active = next;
    scrollMode = mode;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    scheduleDraw();
  }

  const prepareFragment = (source: string): string => {
    const opaque = restoreOpaqueFoilOutput(source);
    const isotropic = aspectCorrectSquareMotifUv(opaque);
    return material.linearOutput
      ? encodeLinearFoilOutput(isotropic)
      : isotropic;
  };

  const ready = (async () => {
    const tiltSrc = prepareFragment(
      await fetchFragmentSource(shaderBase + material.fragment),
    );
    if (destroyed) return;
    const timeSrc = material.fragmentTime
      ? prepareFragment(
          await fetchFragmentSource(shaderBase + material.fragmentTime),
        )
      : null;
    if (destroyed) return;

    const tiltLinked = linkProgram(gl, tiltSrc);
    tiltProgram = buildBindings(tiltLinked);
    if (timeSrc) {
      const timeLinked = linkProgram(gl, timeSrc);
      timeProgram = buildBindings(timeLinked);
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const slots = new Set<string>();
    for (const bindings of [tiltProgram, timeProgram]) {
      if (!bindings) continue;
      for (const sampler of bindings.samplers) slots.add(sampler.slot);
    }

    await Promise.all(
      [...slots].map((slot) => loadSlotTexture(slot, material.textures[slot])),
    );
    if (destroyed) return;
    activate(scrollMode);
  })();

  return {
    ready,
    setTilt(x: number, y: number) {
      tilt = [x, y];
      // Always redraw — even in `time` mode. Pointer hover used to land while
      // the idle clock was still driving, and `scheduleDraw` bails in that
      // mode, so the uniform change stayed invisible until the next tick (or
      // forever, for fragments that only read `_Tilt` in the tilt program).
      if (paused || destroyed) return;
      syncClock();
      if (!frame) frame = requestAnimationFrame(() => draw());
    },
    setLeanDegrees() {
      // Lorcana's fragments scroll a phase from the normalised lean (`setTilt`);
      // none of them takes an angle.
    },
    setScrollMode(mode: WebglFoilScrollMode) {
      if (mode === scrollMode && active) {
        scheduleDraw();
        return;
      }
      activate(mode);
    },
    setDeviceRotationDegrees(degrees: number) {
      deviceRotation = degrees;
      scheduleDraw();
    },
    destroy() {
      destroyed = true;
      // Before anything else: a live subscription would keep the shared clock
      // ticking for a renderer whose context is about to be lost.
      unsubscribeClock?.();
      unsubscribeClock = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frame) cancelAnimationFrame(frame);
      for (const texture of texturesBySlot.values()) {
        gl.deleteTexture(texture);
      }
      texturesBySlot.clear();
      // Do not `loseContext()`: React Strict Mode and backend switches remount
      // the effect on the same <canvas>. A lost context then makes the next
      // `getContext("webgl2")` compile with a null log (HotFoil especially).
      // Programs/textures above are enough; the context dies with the element.
      if (tiltProgram) gl.deleteProgram(tiltProgram.program);
      if (timeProgram && timeProgram !== tiltProgram) {
        gl.deleteProgram(timeProgram.program);
      }
      tiltProgram = null;
      timeProgram = null;
      active = null;
    },
  };
}
