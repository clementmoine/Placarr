/**
 * `MAT_Cards3D_*` uniforms from shadersbundle typetree (ADR-021).
 * Mirrors ``write_material_sheets`` in ``unity/extract.py``.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  iterClassTreeEntries,
  loadUnityFs,
  type UnityTypeTree,
} from "@/lib/unity/loadUnityFs";
import { foilPackDir } from "@/providers/shared/foilPaths";

const MATERIAL_CLASS_ID = 21;
const TEXTURE_CLASS_ID = 28;
const SHEET_SKIP_FLOATS = new Set(["__dirty", "_StencilComp", "_StencilRef"]);

type FloatColorSheet = {
  floats: Record<string, number>;
  colors: Record<string, number[]>;
};

type MotifSheet = Record<string, string>;

function pairsFromUnityArray(raw: unknown): [string, unknown][] {
  if (!Array.isArray(raw)) return [];
  const out: [string, unknown][] = [];
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 2) {
      out.push([String(item[0]), item[1]]);
    }
  }
  return out;
}

function colorToRgba(value: unknown): number[] | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 4) {
    return value.slice(0, 4).map((c) => round6(Number(c)));
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("r" in v && "g" in v && "b" in v && "a" in v) {
      return ["r", "g", "b", "a"].map((k) => round6(Number(v[k])));
    }
  }
  return null;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function texturePathId(texEnv: unknown): string | null {
  if (!texEnv || typeof texEnv !== "object") return null;
  const tex = (texEnv as { m_Texture?: { m_PathID?: bigint | number } })
    .m_Texture;
  const pid = tex?.m_PathID;
  if (pid == null || pid === 0 || pid === 0n) return null;
  return String(pid);
}

function textureName(tree: UnityTypeTree): string {
  const name = tree.m_Name;
  return typeof name === "string" ? name.trim() : "";
}

export function buildMaterialSheetsFromBytes(bytes: Buffer): {
  sheets: Record<string, FloatColorSheet>;
  motifs: Record<string, MotifSheet>;
} {
  const loaded = loadUnityFs(bytes);

  const texturesByPath = new Map<string, string>();
  for (const { tree, pathId } of iterClassTreeEntries(
    loaded,
    TEXTURE_CLASS_ID,
  )) {
    const name = textureName(tree);
    if (name && pathId) texturesByPath.set(pathId, name);
  }

  const sheets: Record<string, FloatColorSheet> = {};
  const motifs: Record<string, MotifSheet> = {};

  for (const { tree } of iterClassTreeEntries(loaded, MATERIAL_CLASS_ID)) {
    const matName = String(tree.m_Name ?? "");
    if (!matName.startsWith("MAT_Cards3D_")) continue;
    const leaf = matName.slice("MAT_Cards3D_".length);
    const props = tree.m_SavedProperties;
    if (!props || typeof props !== "object") continue;
    const rec = props as Record<string, unknown>;

    const floats: Record<string, number> = {};
    for (const [key, value] of pairsFromUnityArray(rec.m_Floats)) {
      if (SHEET_SKIP_FLOATS.has(key)) continue;
      floats[key] = round6(Number(value));
    }

    const colors: Record<string, number[]> = {};
    for (const [key, value] of pairsFromUnityArray(rec.m_Colors)) {
      const rgba = colorToRgba(value);
      if (rgba) colors[key] = rgba;
    }

    sheets[leaf] = {
      floats: Object.fromEntries(
        Object.entries(floats).sort(([a], [b]) => a.localeCompare(b)),
      ),
      colors: Object.fromEntries(
        Object.entries(colors).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };

    const leafMotifs: MotifSheet = {};
    for (const [uniform, texEnv] of pairsFromUnityArray(rec.m_TexEnvs)) {
      const pid = texturePathId(texEnv);
      if (!pid) continue;
      const stem = texturesByPath.get(pid);
      if (!stem) continue;
      leafMotifs[uniform] = stem;
    }
    if (Object.keys(leafMotifs).length > 0) {
      motifs[leaf] = Object.fromEntries(
        Object.entries(leafMotifs).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
  }

  return { sheets, motifs };
}

export function writeMaterialSheets(
  repo: string,
  shadersBundlePath: string,
  opts?: { outDir?: string },
): { materialSheetsPath: string; sharedMotifsPath: string } {
  const bytes = readFileSync(shadersBundlePath);
  const { sheets, motifs } = buildMaterialSheetsFromBytes(bytes);

  const outDir = opts?.outDir ?? foilPackDir(repo, "pokemon");
  mkdirSync(outDir, { recursive: true });
  const materialSheetsPath = path.join(outDir, "materialSheets.json");
  const sharedMotifsPath = path.join(outDir, "shared-motifs.json");
  writeFileSync(
    materialSheetsPath,
    `${JSON.stringify(sheets, null, 1)}\n`,
    "utf8",
  );
  writeFileSync(
    sharedMotifsPath,
    `${JSON.stringify(motifs, null, 1)}\n`,
    "utf8",
  );
  return { materialSheetsPath, sharedMotifsPath };
}
