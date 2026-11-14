/**
 * Extract Frost/Card + UIHologram fragments from `packdata_assets_shader.bundle`
 * (CDN staging Addressables). Frost emits one `.frag` per
 * `EFFECTS_LAYER_COUNT_*` so effects-uv-shine / rainbow / superpara sample
 * `_EffectsLayersTex` instead of the holo-only ZERO leaf.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { toWebgl2Fragment } from "@/core/render/unity/webglFragment";
import { extractFrostCardVariantFiles } from "@/lib/unity/frostCardExtract";
import { iterClassTrees, loadUnityFs } from "@/lib/unity/loadUnityFs";
import { metalSourcesFromBlob } from "@/lib/unity/metalBlob";
import { translateMetalSource } from "@/lib/unity/metalToGlsl";
import {
  decompressPlatformBlobs,
  SHADER_CLASS_ID,
  type ShaderTypeTree,
} from "@/lib/unity/shader";
import { adaptClientFragment } from "@/lib/unity/webglAdapt";

export const DBS_FW_SHADER_BUNDLE = "packdata_assets_shader.bundle";

export type ExtractDbsFwShadersOpts = {
  dataDir?: string;
  shadersDir?: string;
  /** Addressables root from CDN staging (required unless `bundleBytes`). */
  bundlesDir?: string;
  bundleBytes?: Buffer;
  force?: boolean;
};

export type ExtractDbsFwShadersResult = {
  written: string[];
  frostVariants: number;
  uiHologram: boolean;
};

function defaultShadersDir(dataDir: string): string {
  return join(dataDir, "dragonball/fw/foil/shaders");
}

function frostMetalBlob(bundle: Uint8Array): Uint8Array | null {
  const loaded = loadUnityFs(bundle);
  for (const tree of iterClassTrees(loaded, SHADER_CLASS_ID)) {
    const name = (tree as ShaderTypeTree).m_ParsedForm?.m_Name;
    if (name !== "Frost/Card") continue;
    const chunk = decompressPlatformBlobs(tree as ShaderTypeTree).find(
      (c) => c.data.length > 0,
    );
    return chunk?.data ?? null;
  }
  return null;
}

function uiHologramFrag(bundle: Uint8Array): string | null {
  const loaded = loadUnityFs(bundle);
  for (const tree of iterClassTrees(loaded, SHADER_CLASS_ID)) {
    const name = (tree as ShaderTypeTree).m_ParsedForm?.m_Name;
    if (name !== "Shader Graphs/UIHologram") continue;
    const chunk = decompressPlatformBlobs(tree as ShaderTypeTree).find(
      (c) => c.data.length > 0,
    );
    if (!chunk) return null;
    const frag = metalSourcesFromBlob(chunk.data).find(
      (p) => p.stage === "fragment",
    );
    if (!frag) return null;
    const translated = translateMetalSource(frag.source);
    if (!translated?.glsl || translated.stage !== "fragment") return null;
    const wrapped = `#ifdef FRAGMENT\n${translated.glsl}\n#endif\n`;
    return adaptClientFragment(
      toWebgl2Fragment(wrapped, { stripControlChars: true }),
    );
  }
  return null;
}

/**
 * Write FrostCard (+ COUNT variants) and UIHologram under `foil/shaders/`.
 * Pass `bundlesDir` from CDN staging or raw `bundleBytes`.
 */
export async function extractFusionWorldShaders(
  opts: ExtractDbsFwShadersOpts = {},
): Promise<ExtractDbsFwShadersResult> {
  const dataDir = opts.dataDir ?? join(process.cwd(), "data");
  const shadersDir = opts.shadersDir ?? defaultShadersDir(dataDir);
  mkdirSync(shadersDir, { recursive: true });

  const bundle =
    opts.bundleBytes ??
    (() => {
      if (!opts.bundlesDir) {
        throw new Error(
          `Missing bundlesDir for ${DBS_FW_SHADER_BUNDLE} — run Sync foil (CDN) first`,
        );
      }
      const path = join(opts.bundlesDir, DBS_FW_SHADER_BUNDLE);
      if (!existsSync(path)) {
        throw new Error(`Missing ${DBS_FW_SHADER_BUNDLE} under ${opts.bundlesDir}`);
      }
      return readFileSync(path);
    })();

  const metal = frostMetalBlob(bundle);
  if (!metal) {
    throw new Error("Frost/Card Metal blob not found in shader bundle");
  }

  const variants = extractFrostCardVariantFiles(metal);
  if (variants.length === 0) {
    throw new Error("No Frost/Card fragment variants translated");
  }

  const written: string[] = [];
  const keep = new Set<string>();
  for (const v of variants) {
    keep.add(v.fileName);
    const dest = join(shadersDir, v.fileName);
    if (!opts.force && existsSync(dest)) {
      const prev = readFileSync(dest, "utf8");
      if (prev === v.glsl) continue;
    }
    writeFileSync(dest, v.glsl, "utf8");
    written.push(v.fileName);
  }

  const ui = uiHologramFrag(bundle);
  let uiHologram = false;
  if (ui) {
    keep.add("UIHologram.frag");
    const dest = join(shadersDir, "UIHologram.frag");
    if (opts.force || !existsSync(dest) || readFileSync(dest, "utf8") !== ui) {
      writeFileSync(dest, ui, "utf8");
      written.push("UIHologram.frag");
    }
    uiHologram = true;
  }

  try {
    for (const name of readdirSync(shadersDir)) {
      if (!name.endsWith(".frag")) continue;
      if (keep.has(name)) continue;
      if (name === "UIHologram.frag") continue;
      if (!name.startsWith("FrostCard")) continue;
      if (name.startsWith("FrostCard__")) {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(join(shadersDir, name));
      }
    }
  } catch {
    /* best effort */
  }

  return {
    written,
    frostVariants: variants.length,
    uiHologram,
  };
}
