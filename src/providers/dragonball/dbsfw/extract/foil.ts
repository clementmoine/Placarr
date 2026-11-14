/**
 * Client foil kit extract — shaders + shared plates + per-card masks/faces.
 * Soft-skips when StandaloneOSX is missing (cloud / Linux Sync), like Lorcana
 * skips Unity without an APK.
 */
import { join } from "node:path";

import { foilPackDir } from "@/lib/packPaths";
import {
  fusionWorldClientBundlesPresent,
  fusionWorldStandaloneOsxBundlesDir,
} from "@/providers/dragonball/dbsfw/clientPaths";
import { DBS_FW_PACK_ID } from "@/providers/dragonball/dbsfw/indexStore";

export type RunDbsFwFoilExtractOpts = {
  force?: boolean;
  limit?: number;
  match?: string;
  bundlesDir?: string;
  /** Repo root for generated S3TC sidecar module. */
  repo?: string;
};

export type RunDbsFwFoilExtractResult = {
  skipped: boolean;
  reason?: string;
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

/**
 * Dump the Mac client foil kit into `data/dragonball/fw/foil/` (+ card layers).
 */
export async function runDbsFwFoilExtract(
  opts: RunDbsFwFoilExtractOpts = {},
): Promise<RunDbsFwFoilExtractResult> {
  const bundlesDir = opts.bundlesDir ?? fusionWorldStandaloneOsxBundlesDir();
  if (!fusionWorldClientBundlesPresent(bundlesDir)) {
    console.log(
      "skip foil: no StandaloneOSX under DBSCGFW.app (install the Mac client, or run Sync on that machine)",
    );
    return { skipped: true, reason: "no-standalone-osx" };
  }

  // Lazy — unityfs-js decoder is Mac/Node extract only; keep Sync import light.
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

  return { skipped: false, shaders, textures, masks, faces };
}
