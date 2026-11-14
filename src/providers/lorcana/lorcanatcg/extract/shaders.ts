/**
 * Lorcana shader `.frag` extract — Node via patched `unityfs-js` (Unity 6000).
 */

import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AssetManager } from "unityfs-js";

import {
  extractLorcanaShaderFrags,
  iterParsedShaders,
  type LorcanaVariantMaps,
} from "@/lib/unity/lorcanaShader";
import { resolveAssetManager } from "@/lib/unity/loadUnityFs";
import { primaryUnityBundlePath } from "@/providers/lorcana/lorcanatcg/extract/unityApk";
import { LORCANA_UNITY_REVISION } from "@/providers/lorcana/lorcanatcg/extract/unityRevision";

/** Golden parity target for ``data/lorcana/foil/shaders/``. */
export const LORCANA_SHADER_FRAG_COUNT = 58;

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
    console.warn(
      `  ⚠ Lorcana shader extract: ${files.size}/${LORCANA_SHADER_FRAG_COUNT} frags (expected ${LORCANA_SHADER_FRAG_COUNT}) — possible new/removed finish or stale APK`,
    );
  }

  for (const [name, body] of files) {
    writeFileSync(`${opts.shadersDir}/${name}`, body, "utf8");
  }
  // Purge orphan .frag files left by renamed/removed shaders so coverage
  // audits never report stale artifacts.
  try {
    for (const name of readdirSync(opts.shadersDir)) {
      if (!name.endsWith(".frag")) continue;
      if (files.has(name)) continue;
      unlinkSync(path.join(opts.shadersDir, name));
    }
  } catch {
    /* best effort */
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
