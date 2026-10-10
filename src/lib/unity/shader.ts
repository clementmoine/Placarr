/**
 * Unity Shader blob → GLES3 `.frag` (ADR-021 phase C).
 * Parity with `extract.py` `_glsl_programs` / `_to_webgl2_fragment`.
 */

import { decompressBlock } from "unityfs-js/decoders/drivers/lz4.js";

import { iterClassTrees, loadUnityFs, type LoadedUnityFs } from "@/lib/unity/loadUnityFs";

const TPCI_PATH_RE = /TPCi\/Cards3D\/(?:HoloFoil|Standard)\/([A-Za-z0-9]+)/;
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

/** Decompress each platform chunk from a Shader typetree. */
export function decompressPlatformBlobs(
  tree: ShaderTypeTree,
): Array<{ platform: number | null; data: Uint8Array }> {
  const blob = asBlob(tree.compressedBlob);
  const offs = flat(tree.offsets);
  const clens = flat(tree.compressedLengths);
  const dlens = flat(tree.decompressedLengths);
  const plats = flat(tree.platforms);
  const out: Array<{ platform: number | null; data: Uint8Array }> = [];
  for (let i = 0; i < offs.length; i++) {
    const off = offs[i]!;
    const cl = clens[i]!;
    const dl = dlens[i]!;
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

/** Strip Unity ``#ifdef FRAGMENT`` guard for WebGL2. */
export function toWebgl2Fragment(src: string): string {
  let frag: string;
  const i = src.indexOf("#ifdef FRAGMENT");
  if (i >= 0) {
    frag = src.slice(i + "#ifdef FRAGMENT".length);
    const end = frag.lastIndexOf("#endif");
    if (end >= 0) frag = frag.slice(0, end);
    frag = frag.replace(/^\n/, "");
  } else {
    frag = src;
    const stripped = frag.replace(/[\x00\x17\r\n\t ]+$/, "");
    if (stripped.endsWith("#endif")) {
      frag = stripped.slice(0, stripped.lastIndexOf("#endif"));
    }
  }
  frag = [...frag]
    .filter((ch) => ch === "\n" || ch === "\t" || ch.charCodeAt(0) >= 32)
    .join("");
  frag = frag.replace(
    "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1",
    "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0",
  );
  frag = frag.replace(
    "#define UNITY_SUPPORTS_UNIFORM_LOCATION 1",
    "#define UNITY_SUPPORTS_UNIFORM_LOCATION 0",
  );
  return frag.trimEnd() + "\n";
}

function resolveFoilName(
  parsedName: string,
  chunks: Array<{ platform: number | null; data: Uint8Array }>,
): string | null {
  if (parsedName.startsWith("TPCi/Cards3D/")) {
    return parsedName.split("/").pop() ?? null;
  }
  const searchIn = (buf: Uint8Array): string | null => {
    const m = TPCI_PATH_RE.exec(new TextDecoder("utf-8", { fatal: false }).decode(buf));
    return m?.[1] ?? null;
  };
  for (const { data } of chunks) {
    const foil = searchIn(data);
    if (foil) return foil;
  }
  return null;
}

function pickChosenBlob(
  chunks: Array<{ platform: number | null; data: Uint8Array }>,
): Uint8Array | null {
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

/** Parse one Shader typetree into a foil stem + WebGL2 fragment body. */
export function extractShaderFragFromTree(
  tree: ShaderTypeTree,
): ExtractedShaderFrag | null {
  const chunks = decompressPlatformBlobs(tree);
  const chosen = pickChosenBlob(chunks);
  if (!chosen || chosen.length === 0) return null;

  const parsedName = String(tree.m_ParsedForm?.m_Name ?? "");
  const foil = resolveFoilName(parsedName, chunks);
  if (!foil) return null;

  const programs = glslPrograms(chosen);
  const rawFrag = pickFragmentSource(programs);
  if (!rawFrag?.trim()) return null;

  return {
    foil,
    parsedName,
    frag: toWebgl2Fragment(rawFrag),
  };
}

/** Extract TPCi card shader fragments from a loaded UnityFS bundle. */
export function extractShaderFragsFromLoaded(
  loaded: LoadedUnityFs,
): ExtractedShaderFrag[] {
  const out: ExtractedShaderFrag[] = [];
  for (const tree of iterClassTrees(loaded, SHADER_CLASS_ID)) {
    const extracted = extractShaderFragFromTree(tree as ShaderTypeTree);
    if (extracted) out.push(extracted);
  }
  return out;
}

/** Extract TPCi card shader fragments from raw UnityFS bytes. */
export function extractShaderFragsFromBytes(
  data: Uint8Array | ArrayBuffer | Buffer,
): ExtractedShaderFrag[] {
  return extractShaderFragsFromLoaded(loadUnityFs(data));
}
