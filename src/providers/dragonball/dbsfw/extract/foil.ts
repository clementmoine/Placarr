/**
 * Client foil kit extract — shaders + shared plates + per-card masks/faces.
 *
 * Source of truth: Xsolla CDN via GUS → `data/dragonball/fw/staging/xsolla/`.
 * No Mac install path.
 */
import { join } from "node:path";

import { foilPackDir } from "@/lib/packPaths";
import { ensureFusionWorldClientFromCdn } from "@/providers/dragonball/dbsfw/cdn/ensureClient";
import { DBS_FW_PACK_ID } from "@/providers/dragonball/dbsfw/indexStore";
import { existsSync } from "node:fs";

export type RunDbsFwFoilExtractOpts = {
  force?: boolean;
  limit?: number;
  match?: string;
  /** Override Addressables root (tests / already-staged tree). */
  bundlesDir?: string;
  /** Skip CDN (tests with fixtures only). */
  skipCdn?: boolean;
  repo?: string;
};

export type RunDbsFwFoilExtractResult = {
  skipped: boolean;
  reason?: string;
  source?: "cdn" | "override";
  shaders?: { written: string[]; frostVariants: number; uiHologram: boolean };
  textures?: {
    webpWritten: number;
    s3tcWritten: number;
    missing: string[];
    skippedBc7: number;
  };
  masks?: { written: number; skipped: number; failed: number };
  faces?: { written: number; skipped: number; failed: number };
};

async function resolveBundlesDir(
  opts: RunDbsFwFoilExtractOpts,
): Promise<{ dir: string; source: "cdn" | "override" } | null> {
  if (opts.bundlesDir) {
    return existsSync(opts.bundlesDir)
      ? { dir: opts.bundlesDir, source: "override" }
      : null;
  }
  if (opts.skipCdn) return null;

  try {
    const staged = await ensureFusionWorldClientFromCdn({
      force: opts.force,
      repo: opts.repo,
    });
    return { dir: staged.bundlesDir, source: "cdn" };
  } catch (err) {
    console.warn(
      `── fw foil : CDN staging failed (${err instanceof Error ? err.message : err})`,
    );
    return null;
  }
}

/**
 * Dump the Fusion World foil kit into `data/dragonball/fw/foil/` (+ card layers).
 */
export async function runDbsFwFoilExtract(
  opts: RunDbsFwFoilExtractOpts = {},
): Promise<RunDbsFwFoilExtractResult> {
  const resolved = await resolveBundlesDir(opts);
  if (!resolved) {
    console.log(
      "skip foil: CDN staging unavailable (check GUS/Xsolla or 7-Zip)",
    );
    return { skipped: true, reason: "no-cdn-client" };
  }

  const { dir: bundlesDir, source } = resolved;
  console.log(`── fw foil : bundles ← ${source} (${bundlesDir})`);

  const [
    { extractFusionWorldShaders },
    { extractFusionWorldFoilTextures },
    { extractFusionWorldCardMasks },
    { extractFusionWorldCardFaces },
  ] = await Promise.all([
    import("@/providers/dragonball/dbsfw/extract/shaders"),
    import("@/providers/dragonball/dbsfw/extract/foilTextures"),
    import("@/providers/dragonball/dbsfw/extract/cardMasks"),
    import("@/providers/dragonball/dbsfw/extract/cardFaces"),
  ]);

  const force = opts.force === true;
  const repo = opts.repo ?? process.cwd();
  const packFoil = foilPackDir(DBS_FW_PACK_ID);
  const texturesDir = join(packFoil, "textures");
  const shadersDir = join(packFoil, "shaders");
  const sidecarModulePath = join(
    repo,
    "src/effects/dbsfw/s3tcSidecars.generated.ts",
  );

  console.log("── fw foil : shaders (FrostCard COUNT variants + UIHologram)");
  const shaders = await extractFusionWorldShaders({
    shadersDir,
    bundlesDir,
    force,
  });
  console.log(
    `   shaders : ${shaders.written.length} written / ${shaders.frostVariants} Frost variants` +
      (shaders.uiHologram ? " + UIHologram" : ""),
  );

  console.log("── fw foil : shared plates (WebP + S3TC)");
  const textures = await extractFusionWorldFoilTextures({
    bundlesDir,
    texturesDir,
    sidecarModulePath,
    force,
  });
  console.log(
    `   textures : webp=${textures.webpWritten} s3tc=${textures.s3tcWritten} ` +
      `missing=${textures.missing.length} bc7skip=${textures.skippedBc7}`,
  );

  console.log("── fw foil : per-card masks");
  const masks = await extractFusionWorldCardMasks({
    bundlesDir,
    force,
    limit: opts.limit,
    onProgress: (done, total, current) => {
      if (done % 100 === 0 || done === total) {
        console.log(
          `   masks ${done}/${total}  written ${current.written}  skipped ${current.skipped}`,
        );
      }
    },
  });
  console.log(
    `   masks : written=${masks.written} skipped=${masks.skipped} failed=${masks.failed}`,
  );

  console.log("── fw foil : client faces (art.client + layers)");
  const faces = await extractFusionWorldCardFaces({
    bundlesDir,
    force,
    limit: opts.limit,
    match: opts.match,
    onProgress: (done, total, current) => {
      if (done % 50 === 0 || done === total) {
        console.log(
          `   faces ${done}/${total}  written ${current.written}  skipped ${current.skipped}`,
        );
      }
    },
  });
  console.log(
    `   faces : written=${faces.written} skipped=${faces.skipped} failed=${faces.failed}`,
  );

  return { skipped: false, source, shaders, textures, masks, faces };
}
