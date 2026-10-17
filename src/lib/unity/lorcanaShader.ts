/**
 * Lorcana Shader Graph variants → `.frag` (parity with ``dump_unity.py``).
 */

import { decompressBlock } from "unityfs-js/decoders/drivers/lz4.js";

import { toWebgl2Fragment as toWebgl2FragmentPokemon } from "@/lib/unity/shader";

/** Parity with ``dump_unity.py`` ``to_webgl2_fragment`` (no Pokémon char-filter). */
export function toLorcanaWebgl2Fragment(src: string): string {
  const i = src.indexOf("#ifdef FRAGMENT");
  let frag = src.slice(i + "#ifdef FRAGMENT".length);
  frag = frag.slice(0, frag.lastIndexOf("#endif")).replace(/^\n/, "");
  frag = frag.replace(
    "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1",
    "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0",
  );
  frag = frag.replace(
    "#define UNITY_SUPPORTS_UNIFORM_LOCATION 1",
    "#define UNITY_SUPPORTS_UNIFORM_LOCATION 0",
  );
  return frag;
}

export { toWebgl2FragmentPokemon as toWebgl2Fragment };

const CARD_EFFECT_KEYS = ["Foil", "Varnish", "Holo"] as const;
const SCROLL_TILT = "_SCROLLMODE_TILT";
const SCROLL_TIME = "_SCROLLMODE_TIME";

export type LorcanaVariantMaps = {
  tilt: Record<string, Record<string, string>>;
  time: Record<string, Record<string, string>>;
};

type ParsedSubProgram = {
  blobIndex: number;
  keywordIndices: number[];
};

type UnityShaderLike = {
  parsedForm?: {
    name?: string;
    keywordNames?: string[];
    subShaders?: Array<{
      passes?: Array<{
        progVertex?: { playerSubPrograms?: ParsedSubProgram[][] };
        progFragment?: { playerSubPrograms?: ParsedSubProgram[][] };
      }>;
    }>;
  };
  compressedBlob?: Uint8Array;
  offsets?: unknown;
  compressedLengths?: unknown;
  decompressedLengths?: unknown;
};

function flatNumbers(seq: unknown): number[] {
  const out: number[] = [];
  if (!seq) return out;
  const list = Array.isArray(seq) ? seq : [seq];
  for (const v of list) {
    if (Array.isArray(v)) out.push(...v.map(Number));
    else out.push(Number(v));
  }
  return out;
}

function isCardEffect(name: string): boolean {
  return CARD_EFFECT_KEYS.some((k) => name.includes(k));
}

/** Decompressed shader blob — first platform chunk only (parity ``dump_unity.py``). */
export function decompressShaderBlob(shader: UnityShaderLike): Uint8Array | null {
  const blob = shader.compressedBlob;
  if (!blob?.length) return null;

  const off = flatNumbers(shader.offsets)[0];
  const cl = flatNumbers(shader.compressedLengths)[0];
  const dl = flatNumbers(shader.decompressedLengths)[0];
  if (off == null || cl == null || dl == null || cl <= 0 || dl <= 0) return null;

  const chunk = blob.subarray(off, off + cl);
  if (cl === dl) return chunk;
  const out = new Uint8Array(dl);
  decompressBlock(chunk, out, 0, cl, 0);
  return out;
}

export function blobEntryGlsl(data: Uint8Array, index: number): string | null {
  if (data.byteLength < 4 + (index + 1) * 12) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const base = 4 + index * 12;
  const eoff = view.getInt32(base, true);
  const elen = view.getInt32(base + 4, true);
  if (eoff < 0 || elen <= 0 || eoff + elen > data.byteLength) return null;
  const slice = data.subarray(eoff, eoff + elen);
  let startIdx = -1;
  for (let i = 0; i <= slice.length - 8; i++) {
    if (
      slice[i] === 35 &&
      slice[i + 1] === 118 &&
      slice[i + 2] === 101 &&
      slice[i + 3] === 114
    ) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;
  let end = startIdx;
  while (end < slice.length && slice[end] !== 0) end++;
  return new TextDecoder("utf-8", { fatal: false }).decode(
    slice.subarray(startIdx, end),
  );
}

function subProgramsFromProg(
  prog: {
    playerSubPrograms?: ParsedSubProgram[][];
    subPrograms?: ParsedSubProgram[];
  } | null | undefined,
): ParsedSubProgram[] {
  if (!prog) return [];
  const tiers = prog.playerSubPrograms ?? [];
  if (tiers.length) {
    const tier = tiers[0];
    if (Array.isArray(tier) && tier.length) return tier;
    if (tier && !Array.isArray(tier)) return [tier as ParsedSubProgram];
  }
  return prog.subPrograms ?? [];
}

export function variantMap(parsedForm: NonNullable<UnityShaderLike["parsedForm"]>): Map<number, string[]> {
  const kwNames = parsedForm.keywordNames ?? [];
  const mapping = new Map<number, string[]>();
  for (const sub of parsedForm.subShaders ?? []) {
    for (const pass of sub.passes ?? []) {
      for (const kind of ["progVertex", "progFragment"] as const) {
        const prog = pass[kind];
        for (const p of subProgramsFromProg(prog)) {
          const kws = [...(p.keywordIndices ?? [])]
            .sort((a, b) => a - b)
            .map((i) => kwNames[i] ?? "")
            .filter(Boolean)
            .sort();
          mapping.set(p.blobIndex, kws);
        }
      }
    }
  }
  return mapping;
}

export function variantKey(keywords: string[]): string {
  return [...keywords]
    .filter(
      (k) =>
        !k.startsWith("_SCROLLMODE") &&
        !k.startsWith("UNITY_") &&
        !k.startsWith("STEREO"),
    )
    .sort()
    .join("__");
}

export function extractLorcanaShaderFrags(
  shaders: UnityShaderLike[],
): { maps: LorcanaVariantMaps; files: Map<string, string> } {
  const tiltGraphs: LorcanaVariantMaps["tilt"] = {};
  const timeGraphs: LorcanaVariantMaps["time"] = {};
  const files = new Map<string, string>();

  for (const shader of shaders) {
    const pf = shader.parsedForm;
    const graph = String(pf?.name ?? "");
    if (!isCardEffect(graph) || !graph.startsWith("Shader Graphs/")) continue;

    const data = decompressShaderBlob(shader);
    if (!data?.length || !pf) continue;

    const variants = variantMap(pf);
    const leaf = graph.split("/").pop() ?? graph;
    const tiltVariants: Record<string, string> = {};
    const timeVariants: Record<string, string> = {};

    for (const [blobIndex, keywords] of [...variants.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      if (keywords.some((k) => k.startsWith("UNITY_UI_") || k.startsWith("STEREO"))) {
        continue;
      }
      const isTilt = keywords.includes(SCROLL_TILT);
      const isTime = keywords.includes(SCROLL_TIME);
      if (!isTilt && !isTime) continue;

      const glsl = blobEntryGlsl(data, blobIndex);
      if (!glsl) continue;

      const key = variantKey(keywords);
      let fileName = leaf + (key ? `__${key}` : "");
      if (isTime) fileName += `__${SCROLL_TIME}`;
      fileName += ".frag";

      files.set(fileName, toLorcanaWebgl2Fragment(glsl));
      if (isTilt) tiltVariants[key] = fileName;
      if (isTime) timeVariants[key] = fileName;
    }

    tiltGraphs[graph] = tiltVariants;
    timeGraphs[graph] = timeVariants;
  }

  return { maps: { tilt: tiltGraphs, time: timeGraphs }, files };
}

export function iterParsedShaders(
  getInfos: (className: string) => Array<{ object?: unknown }>,
): UnityShaderLike[] {
  const out: UnityShaderLike[] = [];
  for (const info of getInfos("Shader")) {
    try {
      const shader = info.object as UnityShaderLike;
      if (shader?.parsedForm?.name && shader.compressedBlob?.byteLength) {
        out.push(shader);
      }
    } catch {
      /* broken shader layout */
    }
  }
  return out;
}
