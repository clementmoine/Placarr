/**
 * Lorcana shader `.frag` extract — Node via patched `unityfs-js` (Unity 6000).
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

import type { AssetManager } from "unityfs-js";

import {
  extractLorcanaShaderFrags,
  iterParsedShaders,
  type LorcanaVariantMaps,
} from "@/lib/unity/lorcanaShader";
import { resolveAssetManager } from "@/lib/unity/loadUnityFs";
import { primaryUnityBundlePath } from "@/providers/lorcanatcg/extractUnityApk";
import { LORCANA_UNITY_REVISION } from "@/providers/lorcanatcg/unityRevision";

/** Golden parity target for ``data/lorcana/foil/shaders/``. */
export const LORCANA_SHADER_FRAG_COUNT = 48;

function nodeShaderExtract(
  am: AssetManager,
): { maps: LorcanaVariantMaps; files: Map<string, string> } {
  const parsed = iterParsedShaders((c) => am.getObjectInfosByClass(c));
  return extractLorcanaShaderFrags(parsed);
}

export function shadersByPathFromManager(am: AssetManager): Map<string, string> {
  const shadersByPath = new Map<string, string>();
  for (const info of am.getObjectInfosByClass("Shader")) {
    try {
      const s = info.object as { parsedForm?: { name?: string } };
      const graph = String(s.parsedForm?.name ?? "");
      if (graph) shadersByPath.set(String(info.pathID), graph);
    } catch {
      /* skip */
    }
  }
  return shadersByPath;
}

export type ExtractLorcanaShadersOpts = {
  dataDir: string;
  shadersDir: string;
  bundleBytes?: Buffer;
  /** Reuse a loaded AssetManager (skip parse). */
  am?: AssetManager;
};

export type ExtractLorcanaShadersResult = {
  maps: LorcanaVariantMaps;
  files: Map<string, string>;
  shadersByPath: Map<string, string>;
};

export async function extractLorcanaShaders(
  opts: ExtractLorcanaShadersOpts,
): Promise<ExtractLorcanaShadersResult> {
  const am =
    opts.am ??
    (await resolveAssetManager(
      opts.bundleBytes ?? readFileSync(primaryUnityBundlePath(opts.dataDir)),
      {
        enableTypeTree: false,
        unityRevision: LORCANA_UNITY_REVISION,
      },
    ));

  const { maps, files } = nodeShaderExtract(am);
  if (files.size < LORCANA_SHADER_FRAG_COUNT) {
    throw new Error(
      `Lorcana shader extract incomplete: ${files.size}/${LORCANA_SHADER_FRAG_COUNT} frags`,
    );
  }

  for (const [name, body] of files) {
    writeFileSync(`${opts.shadersDir}/${name}`, body, "utf8");
  }

  return {
    maps,
    files,
    shadersByPath: shadersByPathFromManager(am),
  };
}

/** Read frags already written under ``shadersDir`` (tests). */
export function readFragsFromDisk(shadersDir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of readdirSync(shadersDir)) {
    if (!name.endsWith(".frag")) continue;
    files.set(name, readFileSync(`${shadersDir}/${name}`, "utf8"));
  }
  return files;
}
