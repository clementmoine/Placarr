/**
 * Unity Shader blob → GLES3 `.frag` (ADR-021 phase C).
 * Parity with `extract.py` `_glsl_programs` / `_to_webgl2_fragment`.
 */

import { decompressBlock } from "unityfs-js/decoders/drivers/lz4.js";

import { toWebgl2Fragment } from "@/core/render/unity/webglFragment";
import { iterClassTrees, loadUnityFs, type LoadedUnityFs } from "@/lib/unity/loadUnityFs";
import {
  preferredMetalFragment,
  translateMetalSource,
} from "@/lib/unity/metalToGlsl";

export { toWebgl2Fragment };

/** Unity ClassIDType.Shader */
export const SHADER_CLASS_ID = 48;

export type ShaderTypeTree = {
  m_ParsedForm?: { m_Name?: string };
  platforms?: unknown;
  offsets?: unknown;
  compressedLengths?: unknown;
  decompressedLengths?: unknown;
  compressedBlob?: number[] | Uint8Array;
};

export type ExtractedShaderFrag = {
  foil: string;
  parsedName: string;
  frag: string;
};

export type ShaderPlatformChunk = {
  platform: number | null;
  data: Uint8Array;
};

export type ShaderFragNameInput = {
  parsedName: string;
  chunks: ShaderPlatformChunk[];
};

export type ShaderFragExtractOptions = {
  /**
   * Stem written as the fragment name.
   * Default: last segment of the parsed asset path.
   * A pack whose foil id lives only inside the blob passes its own resolver.
   */
  resolveName?: (input: ShaderFragNameInput) => string | null;
  /** Drop control bytes before compile. Shader Graph dumps pass false. */
  stripControlChars?: boolean;
};

/** Last segment of a Unity asset path. Empty when the shader has no name. */
export function shaderNameFromPath(parsedName: string): string | null {
  const leaf = parsedName.split("/").pop()?.trim() ?? "";
  return leaf || null;
}

function flat(seq: unknown): number[] {
  const out: number[] = [];
  if (!seq) return out;
  const list = Array.isArray(seq) ? seq : [seq];
  for (const v of list) {
    if (Array.isArray(v)) out.push(...v.map(Number));
    else out.push(Number(v));
  }
  return out;
}

function asBlob(data: number[] | Uint8Array | undefined): Uint8Array {
  if (!data) return new Uint8Array(0);
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Decompress each platform chunk from a Shader typetree or object. */
export function decompressPlatformBlobs(
  tree: ShaderTypeTree,
): ShaderPlatformChunk[] {
  const blob = asBlob(tree.compressedBlob);
  const offs = flat(tree.offsets);
  const clens = flat(tree.compressedLengths);
  const dlens = flat(tree.decompressedLengths);
  const plats = flat(tree.platforms);
  const out: ShaderPlatformChunk[] = [];
  for (let i = 0; i < offs.length; i++) {
    const off = offs[i];
    const cl = clens[i];
    const dl = dlens[i];
    if (off == null || cl == null || dl == null || cl <= 0 || dl <= 0) continue;
    const chunk = blob.subarray(off, off + cl);
    let data: Uint8Array;
    if (cl === dl) {
      data = chunk;
    } else {
      data = new Uint8Array(dl);
      decompressBlock(chunk, data, 0, cl, 0);
    }
    out.push({
      platform: i < plats.length ? plats[i]! : null,
      data,
    });
  }
  return out;
}

/** Split a decompressed blob into ``#version …`` GLSL programs. */
export function glslPrograms(data: Uint8Array): string[] {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
  const idxs = [...text.matchAll(/#version\s+\d+/g)].map((m) => m.index!);
  const parts: string[] = [];
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i]!;
    const end = idxs[i + 1] ?? text.length;
    let chunk = text.slice(start, end);
    const nul = chunk.indexOf("\0");
    if (nul !== -1) chunk = chunk.slice(0, nul);
    parts.push(chunk.trim() + "\n");
  }
  return parts;
}

function pickChosenBlob(chunks: ShaderPlatformChunk[]): Uint8Array | null {
  for (const { platform, data } of chunks) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
    if (platform === 9 || text.includes("#version 300")) return data;
  }
  return chunks[0]?.data ?? null;
}

function pickFragmentSource(programs: string[]): string | null {
  for (const p of programs) {
    if (
      p.includes("#version 300") &&
      p.includes("SV_Target") &&
      !p.includes("gl_Position")
    ) {
      return p;
    }
  }
  for (const p of programs) {
    if (
      p.includes("#version 300") &&
      p.includes("precision highp float") &&
      !p.includes("gl_Position")
    ) {
      return p;
    }
  }
  for (const p of programs) {
    if (p.includes("#ifdef FRAGMENT") && !p.includes("gl_Position")) {
      const frag = toWebgl2Fragment(p);
      if (frag.trim()) return p;
    }
  }
  return null;
}

function shaderParsedName(tree: ShaderTypeTree): string {
  const form = tree.m_ParsedForm as { m_Name?: string; name?: string } | undefined;
  const alt = tree as ShaderTypeTree & {
    parsedForm?: { name?: string; m_Name?: string };
    name?: string;
    m_Name?: string;
  };
  return String(
    form?.m_Name ??
      form?.name ??
      alt.parsedForm?.m_Name ??
      alt.parsedForm?.name ??
      alt.m_Name ??
      alt.name ??
      "",
  );
}

/** Parse one Shader typetree into a stem + WebGL2 fragment body. */
export function extractShaderFragFromTree(
  tree: ShaderTypeTree,
  options?: ShaderFragExtractOptions,
): ExtractedShaderFrag | null {
  const chunks = decompressPlatformBlobs(tree);
  const chosen = pickChosenBlob(chunks);
  if (!chosen || chosen.length === 0) return null;

  const parsedName = shaderParsedName(tree);
  const resolveName = options?.resolveName ?? ((input) => shaderNameFromPath(input.parsedName));
  const foil = resolveName({ parsedName, chunks });
  if (!foil) return null;

  const programs = glslPrograms(chosen);
  const rawFrag = pickFragmentSource(programs);
  const metal = rawFrag?.trim()
    ? null
    : translateMetalSource(preferredMetalFragment(chosen) ?? "");
  const source = rawFrag?.trim()
    ? rawFrag
    : metal?.stage === "fragment"
      ? `#ifdef FRAGMENT\n${metal.glsl}\n#endif\n`
      : null;
  if (!source?.trim()) return null;

  return {
    foil,
    parsedName,
    frag: toWebgl2Fragment(source, {
      stripControlChars: options?.stripControlChars !== false,
    }),
  };
}

/** Extract card shader fragments from a loaded UnityFS bundle. */
export function extractShaderFragsFromLoaded(
  loaded: LoadedUnityFs,
  options?: ShaderFragExtractOptions,
): ExtractedShaderFrag[] {
  const out: ExtractedShaderFrag[] = [];
  for (const tree of iterClassTrees(loaded, SHADER_CLASS_ID)) {
    const extracted = extractShaderFragFromTree(tree as ShaderTypeTree, options);
    if (extracted) out.push(extracted);
  }
  return out;
}

/** Extract card shader fragments from raw UnityFS bytes. */
export function extractShaderFragsFromBytes(
  data: Uint8Array | ArrayBuffer | Buffer,
  options?: ShaderFragExtractOptions,
): ExtractedShaderFrag[] {
  return extractShaderFragsFromLoaded(loadUnityFs(data), options);
}
