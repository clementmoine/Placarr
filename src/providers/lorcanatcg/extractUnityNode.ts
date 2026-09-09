/**
 * Full Node Lorcana Unity extract (ADR-021) — replaces legacy UnityPy
 * ``mobile.py`` / ``dump_unity.py``.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AssetManager } from "unityfs-js";

import {
  extractLorcanaShaders,
  LORCANA_SHADER_FRAG_COUNT,
} from "@/providers/lorcanatcg/extractLorcanaShaders";
import {
  applyAstcToManifest,
  buildLorcanaManifest,
} from "@/providers/lorcanatcg/lorcanaMaterials";
import {
  dumpLorcanaCardBack,
  dumpLorcanaTextures,
  loadLorcanaUnityBundle,
} from "@/providers/lorcanatcg/lorcanaTextures";
import {
  primaryUnityBundlePath,
  resolveLorcanaUnityDataDir,
} from "@/providers/lorcanatcg/extractUnityApk";
import {
  foilPackDir,
  packCardsDir,
} from "@/providers/shared/foilPaths";

const PLAY_HINT =
  "https://play.google.com/store/apps/details?id=com.ravensburger.disney.lorcana";

export type ExtractUnityNodeOpts = {
  repo: string;
  apk?: string | null;
  data?: string | null;
};

export type ExtractUnityNodeResult = {
  provider: "lorcanamobile";
  pack: string;
  shaders: number;
  textures: number;
  astcFiles: number;
  manifest: string;
  foil: string;
  playStore: string;
  nodeExtract: true;
  cardBack: boolean;
};

function clearStaleTextures(texturesDir: string): void {
  if (!texturesDir) return;
  try {
    for (const stale of readdirSync(texturesDir)) {
      if (/\.(png|astc|jpg|jpeg|webp)$/i.test(stale)) {
        rmSync(path.join(texturesDir, stale));
      }
    }
  } catch {
    /* ignore */
  }
}

function indexObjects(
  am: AssetManager,
  shadersByPath: Map<string, string>,
): {
  texturesByPath: Map<string, string>;
  textureSettingsByName: Map<string, Record<string, unknown>>;
  shadersByPath: Map<string, string>;
  materials: Array<{ object?: unknown }>;
} {
  const texturesByPath = new Map<string, string>();
  const textureSettingsByName = new Map<string, Record<string, unknown>>();
  const materials: Array<{ object?: unknown }> = [];

  for (const info of am.getObjectInfosByClass("Texture2D")) {
    try {
      const tex = info.object as {
        name?: string;
        textureSettings?: { wrapU?: number; filterMode?: number; aniso?: number };
        mipCount?: number;
      };
      const name = String(tex.name ?? info.name ?? "");
      if (!name) continue;
      texturesByPath.set(String(info.pathID), name);
      textureSettingsByName.set(name, {
        wrap: ["repeat", "clamp", "mirror", "mirrorOnce"][tex.textureSettings?.wrapU ?? 0] ?? "repeat",
        filter: ["point", "bilinear", "trilinear"][tex.textureSettings?.filterMode ?? 1] ?? "bilinear",
        mipmaps: (tex.mipCount ?? 1) > 1,
        aniso: tex.textureSettings?.aniso ?? 1,
      });
    } catch {
      /* skip */
    }
  }

  for (const info of am.getObjectInfosByClass("Material")) {
    try {
      materials.push({ object: info.object });
    } catch {
      /* skip */
    }
  }

  return {
    texturesByPath,
    textureSettingsByName,
    shadersByPath,
    materials,
  };
}

export async function extractUnityNode(
  opts: ExtractUnityNodeOpts,
): Promise<ExtractUnityNodeResult> {
  const dataDir = resolveLorcanaUnityDataDir(opts);
  const bundlePath = primaryUnityBundlePath(dataDir);
  console.log(`Bundle: ${bundlePath}`);

  const pack = "lorcana";
  const foilDir = foilPackDir(opts.repo, pack);
  const shadersDir = path.join(foilDir, "shaders");
  const texturesDir = path.join(foilDir, "textures");
  const manifestPath = path.join(foilDir, "manifest.json");
  const cardBackPath = path.join(packCardsDir(opts.repo, pack), "back.webp");
  mkdirSync(shadersDir, { recursive: true });

  const unity = await loadLorcanaUnityBundle(bundlePath);

  console.log("Phase 1 — shaders (Tilt + Time)");
  const { maps, files, shadersByPath } = await extractLorcanaShaders({
    dataDir,
    shadersDir,
    am: unity.am,
  });
  console.log(`  Node: ${files.size}/${LORCANA_SHADER_FRAG_COUNT} frags`);
  if (!Object.keys(maps.tilt).length && !Object.keys(maps.time).length) {
    throw new Error(
      "No card-effect shaders found — merge base.apk + UnityDataAssetPack.apk",
    );
  }

  console.log("Phase 2 — materials");
  const indexed = indexObjects(unity.am, shadersByPath);
  const { manifest, bundleTextures } = buildLorcanaManifest(
    indexed.materials.map((m) => m.object) as never[],
    indexed.texturesByPath,
    indexed.textureSettingsByName as never,
    indexed.shadersByPath,
    maps,
    shadersDir,
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log("Phase 3 — textures");
  clearStaleTextures(texturesDir);
  const { astcByName, astcFiles } = await dumpLorcanaTextures(
    unity,
    bundleTextures,
    texturesDir,
  );
  const patched = applyAstcToManifest(manifest, astcByName);
  if (patched > 0) {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  console.log("Phase 4 — card back");
  const cardBack = await dumpLorcanaCardBack(unity, cardBackPath);

  return {
    provider: "lorcanamobile",
    pack,
    shaders: Object.keys(maps.tilt).length + Object.keys(maps.time).length,
    textures: bundleTextures.size,
    astcFiles,
    manifest: manifestPath,
    foil: foilDir,
    playStore: PLAY_HINT,
    nodeExtract: true,
    cardBack,
  };
}
