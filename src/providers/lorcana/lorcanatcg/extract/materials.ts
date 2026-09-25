/**
 * Lorcana foil materials → ``foil/manifest.json`` (parity ``dump_materials``).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { LorcanaVariantMaps } from "@/lib/unity/lorcanaShader";
import { variantKey } from "@/lib/unity/lorcanaShader";

const RUNTIME_ROLES: Record<string, string> = {
  _Motif: "art",
  _MotifMask: "foilMask",
  _TopLayerMask: "varnishMask",
  _SecondTopLayerMask: "secondVarnishMask",
  _NormalMap: "normals",
};

const UNIFORM_RE =
  /(?:UNITY_UNIFORM|uniform)\s+(?:mediump\s+|highp\s+|lowp\s+)?(?:vec[234]|float|int|sampler2D)\s+(_\w+)\s*;/g;

const WRAP_MODE: Record<number, string> = {
  0: "repeat",
  1: "clamp",
  2: "mirror",
  3: "mirrorOnce",
};
const FILTER_MODE: Record<number, string> = {
  0: "point",
  1: "bilinear",
  2: "trilinear",
};

type TextureSettings = {
  wrap: string;
  filter: string;
  mipmaps: boolean;
  aniso: number;
};

type UnityTextureLike = {
  name?: string;
  m_Name?: string;
  m_MipCount?: number;
  mipCount?: number;
  m_TextureSettings?: {
    m_WrapU?: number;
    m_FilterMode?: number;
    m_Aniso?: number;
  };
  textureSettings?: {
    wrapU?: number;
    filterMode?: number;
    aniso?: number;
  };
};

type UnityMaterialLike = {
  name?: string;
  shader?: { pathID?: bigint | number };
  validKeywords?: string[];
  savedProperties?: {
    texEnvs?: Array<{ key: string; value: { texture: { pathID?: bigint | number } } }>;
    floats?: Array<{ key: string; value: number }>;
    colors?: Array<{ key: string; value: { r: number; g: number; b: number; a: number } }>;
  };
};

function pathId(ptr: { pathID?: bigint | number } | null | undefined): string | null {
  const pid = ptr?.pathID;
  if (pid == null || pid === 0 || pid === 0n) return null;
  return String(pid);
}

function fragmentUniforms(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(UNIFORM_RE)) {
    const n = m[1]!;
    if (!n.startsWith("Xhlslcc_UnusedX")) out.add(n);
  }
  return out;
}

function resolveVariant(
  variants: Record<string, string>,
  keywords: string[],
): string | null {
  const key = variantKey(keywords);
  if (key in variants) return variants[key]!;
  const wanted = new Set(key ? key.split("__") : []);
  const candidates: Array<[number, string]> = [];
  for (const [haveKey, file] of Object.entries(variants)) {
    const have = new Set(haveKey ? haveKey.split("__") : []);
    if ([...wanted].every((k) => have.has(k))) {
      candidates.push([have.size, file]);
    }
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a[0] - b[0])[0]![1];
}

function textureSettings(tex: UnityTextureLike): TextureSettings {
  const ts = (tex.textureSettings ?? tex.m_TextureSettings) as
    | {
        wrapU?: number;
        m_WrapU?: number;
        filterMode?: number;
        m_FilterMode?: number;
        aniso?: number;
        m_Aniso?: number;
      }
    | undefined;
  const wrapU = Number(ts?.wrapU ?? ts?.m_WrapU ?? 0);
  const filter = Number(ts?.filterMode ?? ts?.m_FilterMode ?? 1);
  const aniso = Number(ts?.aniso ?? ts?.m_Aniso ?? 1);
  const mips = Number(tex.mipCount ?? tex.m_MipCount ?? 1);
  return {
    wrap: WRAP_MODE[wrapU] ?? "repeat",
    filter: FILTER_MODE[filter] ?? "bilinear",
    mipmaps: mips > 1,
    aniso,
  };
}

export function buildLorcanaManifest(
  materials: UnityMaterialLike[],
  texturesByPath: Map<string, string>,
  textureSettingsByName: Map<string, TextureSettings>,
  shadersByPath: Map<string, string>,
  maps: LorcanaVariantMaps,
  shadersDir: string,
): { manifest: Record<string, unknown>; bundleTextures: Set<string> } {
  const manifest: Record<string, unknown> = {};
  const bundleTextures = new Set<string>();

  for (const m of materials) {
    const name = String(m.name ?? "");
    const shaderPid = pathId(m.shader);
    const graph = shaderPid ? shadersByPath.get(shaderPid) ?? "" : "";
    if (!graph || !(graph in maps.tilt)) continue;

    const keywords = [...(m.validKeywords ?? [])];
    const fragment = resolveVariant(maps.tilt[graph]!, keywords);
    if (!fragment) continue;
    const fragmentTime = resolveVariant(maps.time[graph] ?? {}, keywords);

    let used = fragmentUniforms(readFileSync(path.join(shadersDir, fragment), "utf8"));
    if (fragmentTime) {
      used = new Set([
        ...used,
        ...fragmentUniforms(readFileSync(path.join(shadersDir, fragmentTime), "utf8")),
      ]);
    }
    for (const baseFrag of [fragment, fragmentTime]) {
      if (!baseFrag || !baseFrag.includes("___VARNISHTYPE_")) continue;
      if (baseFrag.includes("USESECONDTOPLAYER")) continue;
      const sibling = baseFrag.replace(
        "___VARNISHTYPE_",
        "___USESECONDTOPLAYER___VARNISHTYPE_",
      );
      const siblingPath = path.join(shadersDir, sibling);
      if (existsSync(siblingPath)) {
        for (const u of fragmentUniforms(readFileSync(siblingPath, "utf8"))) {
          used.add(u);
        }
      }
    }

    const entry: Record<string, unknown> = {
      graph,
      keywords,
      fragment,
      textures: {},
      floats: {},
      colors: {},
    };
    if (fragmentTime) entry.fragmentTime = fragmentTime;

    const saved = m.savedProperties;
    const unboundTex: string[] = [];
    for (const { key, value } of saved?.texEnvs ?? []) {
      if (!used.has(key)) continue;
      const texName = texturesByPath.get(pathId(value.texture) ?? "");
      if (key in RUNTIME_ROLES) {
        (entry.textures as Record<string, unknown>)[key] = {
          role: RUNTIME_ROLES[key],
        };
      } else if (texName) {
        const binding: Record<string, unknown> = {
          file: `${texName.toLowerCase()}.webp`,
          ...textureSettingsByName.get(texName),
        };
        (entry.textures as Record<string, unknown>)[key] = binding;
        bundleTextures.add(texName);
      } else {
        unboundTex.push(key);
      }
    }

    const donor = Object.entries(entry.textures as Record<string, { file?: string }>).find(
      ([slot, binding]) => slot.includes("DistortionTex") && binding.file,
    )?.[1];
    for (const key of unboundTex) {
      if (donor && key.includes("DistortionTex")) {
        (entry.textures as Record<string, unknown>)[key] = structuredClone(donor);
        continue;
      }
    }

    for (const { key, value } of saved?.floats ?? []) {
      if (used.has(key)) {
        (entry.floats as Record<string, number>)[key] = Math.round(value * 1_000_000) / 1_000_000;
      }
    }
    for (const { key, value } of saved?.colors ?? []) {
      if (used.has(key)) {
        (entry.colors as Record<string, number[]>)[key] = [
          value.r,
          value.g,
          value.b,
          value.a,
        ].map((c) => Math.round(c * 1_000_000) / 1_000_000);
      }
    }

    manifest[name] = entry;
  }

  return { manifest, bundleTextures };
}

export function applyAstcToManifest(
  manifest: Record<string, unknown>,
  astcByName: Record<string, Record<string, unknown>>,
): number {
  if (!Object.keys(astcByName).length) return 0;
  const lowerToAstc = Object.fromEntries(
    Object.entries(astcByName).map(([k, v]) => [k.toLowerCase(), v]),
  );
  let patched = 0;
  for (const entry of Object.values(manifest)) {
    const textures = (entry as { textures?: Record<string, Record<string, unknown>> })
      .textures;
    if (!textures) continue;
    for (const binding of Object.values(textures)) {
      if (binding.role || binding.astc) continue;
      const raster = String(binding.file ?? "");
      if (!/\.(png|webp)$/i.test(raster)) continue;
      const base = raster.replace(/\.[^.]+$/, "");
      const astc = lowerToAstc[base];
      if (astc) {
        binding.astc = astc;
        patched++;
      }
      if (raster.endsWith(".png")) binding.file = `${base}.webp`;
    }
  }
  return patched;
}

/** Deep-clone helper when structuredClone unavailable in older targets. */
function structuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
