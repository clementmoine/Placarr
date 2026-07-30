import {
  fetchArrayBuffer,
  fetchFragmentSource,
  fetchImageBitmap,
} from "@/core/render/foil/cache";
import {
  astcFormatConstant,
  getFoilCapabilities,
} from "@/core/render/foil/capabilities";
import type {
  FoilAstcBinding,
  FoilFilter,
  FoilMaterial,
  FoilTextureBinding,
  FoilWrap,
} from "@/core/render/foil/types";

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

const VERTEX_SRC = `#version 300 es
layout(location = 0) in vec2 position;
out highp vec4 vs_INTERP0;
out highp vec4 vs_INTERP2;
void main() {
  vs_INTERP0 = vec4(position * 0.5 + 0.5, 0.0, 0.0);
  vs_INTERP2 = vec4(1.0);
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

const WRAP_GL: Record<FoilWrap, number> = {
  repeat: 0,
  clamp: 0,
  mirror: 0,
  mirrorOnce: 0,
};

function wrapMode(gl: WebGL2RenderingContext, wrap: FoilWrap | undefined): number {
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

export type WebglFoilSurfaces = {
  artUrl: string;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  hotFoilColor?: readonly [number, number, number, number] | null;
  secondHotFoilColor?: readonly [number, number, number, number] | null;
};

export type WebglFoilScrollMode = "time" | "tilt";

export type WebglFoilRenderer = {
  ready: Promise<void>;
  setTilt(x: number, y: number): void;
  setScrollMode(mode: WebglFoilScrollMode): void;
  setDeviceRotationDegrees(degrees: number): void;
  destroy(): void;
};

const ROLE_FALLBACK: Record<string, [number, number, number, number]> = {
  art: [128, 128, 128, 255],
  foilMask: [255, 255, 255, 255],
  varnishMask: [0, 0, 0, 255],
  secondVarnishMask: [0, 0, 0, 255],
  normals: [128, 128, 255, 255],
};

function recoverFoilMaskRgb(image: ImageBitmap): ImageBitmap | Promise<ImageBitmap> {
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
  cosTimeLoc: WebGLUniformLocation | null;
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
  if (!gl) throw new Error("WebGL2 indisponible");

  const shaderBase = `${assetBase}/shaders/`;
  const textureBase = `${assetBase}/textures/`;

  let tiltProgram: ProgramBindings | null = null;
  let timeProgram: ProgramBindings | null = null;
  let active: ProgramBindings | null = null;
  let scrollMode: WebglFoilScrollMode = material.fragmentTime ? "time" : "tilt";
  let destroyed = false;
  let frame = 0;
  let paused = document.visibilityState === "hidden";
  let tilt: readonly [number, number] = [0, 0];
  let deviceRotation = material.floats._DeviceRotationDegrees ?? 0;
  let timeOrigin = performance.now();
  const texturesBySlot = new Map<string, WebGLTexture>();

  function onVisibilityChange() {
    paused = document.visibilityState === "hidden";
    if (paused) {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
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
    const mipmaps =
      !options.compressed && !isRole && Boolean(binding?.mipmaps);
    const filter = binding?.filter ?? "bilinear";
    gl!.texParameteri(
      gl!.TEXTURE_2D,
      gl!.TEXTURE_WRAP_S,
      wrapMode(gl!, wrap),
    );
    gl!.texParameteri(
      gl!.TEXTURE_2D,
      gl!.TEXTURE_WRAP_T,
      wrapMode(gl!, wrap),
    );
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
      gl!.RGBA,
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
    const fallback = (role && ROLE_FALLBACK[role]) ?? [0, 0, 0, 255];
    texturesBySlot.set(
      slot,
      solidTexture(fallback as [number, number, number, number]),
    );

    if (binding?.astc && binding.file && !role && supportsAstcOnContext(gl!)) {
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
        (info.name === "_HotFoilColor" || info.name === "_VarnishLightColor")
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
      if (info.type === gl!.FLOAT && float !== undefined) {
        gl!.uniform1f(location, float);
      } else if (info.type === gl!.FLOAT_VEC2 && color) {
        gl!.uniform2f(location, color[0], color[1]);
      } else if (info.type === gl!.FLOAT_VEC3 && color) {
        gl!.uniform3f(location, color[0], color[1], color[2]);
      } else if (info.type === gl!.FLOAT_VEC4 && color) {
        gl!.uniform4f(location, color[0], color[1], color[2], color[3]);
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

  function buildBindings(program: WebGLProgram): ProgramBindings {
    gl!.useProgram(program);
    bindStaticUniforms(program);
    return {
      program,
      tiltLoc: gl!.getUniformLocation(program, "_Tilt"),
      cosTimeLoc: gl!.getUniformLocation(program, "_CosTime"),
      deviceRotLoc: gl!.getUniformLocation(program, "_DeviceRotationDegrees"),
      samplers: collectSamplers(program),
    };
  }

  function draw() {
    frame = 0;
    if (destroyed || !active || paused) return;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.useProgram(active.program);

    if (active.tiltLoc) gl!.uniform2f(active.tiltLoc, tilt[0], tilt[1]);
    if (active.cosTimeLoc) {
      const cos = foilCosTime((performance.now() - timeOrigin) / 1000);
      gl!.uniform4f(active.cosTimeLoc, cos[0], cos[1], cos[2], cos[3]);
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

    if (scrollMode === "time" && !destroyed && !paused) {
      frame = requestAnimationFrame(draw);
    }
  }

  function scheduleDraw() {
    if (paused) return;
    if (scrollMode === "time") {
      if (!frame) frame = requestAnimationFrame(draw);
      return;
    }
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function activate(mode: WebglFoilScrollMode) {
    const next =
      mode === "time" ? (timeProgram ?? tiltProgram) : (tiltProgram ?? timeProgram);
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

  const ready = (async () => {
    const tiltSrc = restoreOpaqueFoilOutput(
      await fetchFragmentSource(shaderBase + material.fragment),
    );
    if (destroyed) return;
    const timeSrc = material.fragmentTime
      ? restoreOpaqueFoilOutput(
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
      if (scrollMode === "tilt") scheduleDraw();
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
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frame) cancelAnimationFrame(frame);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
