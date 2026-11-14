/**
 * Client foil kit extract — shaders + shared plates + per-card masks/faces.
 *
 * Source of truth: Xsolla CDN via GUS → `data/dragonball/fw/staging/xsolla/`.
 * No Mac install path.
 *
 * Freshness:
 * - CDN volumes: reuse when `version.json` matches GUS version/build (no redownload).
 * - Kit steps: skip when stamp.kit.*Ok for that same version (no force / limit / match).
 * - Per-card faces/masks still skip individually when walking is required.
 * - New CDN version clears kit flags and re-runs extract steps.
 */
import { join } from "node:path";

import { foilPackDir } from "@/lib/packPaths";
import {
  ensureFusionWorldClientFromCdn,
  foilKitStepFresh,
  updateFwClientKit,
  type EnsureFwClientResult,
  type FwClientStamp,
} from "@/providers/dragonball/dbsfw/cdn/ensureClient";
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
  /**
   * Force CDN redownload/extract even when version matches.
   * Default false — Sync never redownloads an unchanged GUS version.
   */
  forceCdn?: boolean;
  repo?: string;
};

export type RunDbsFwFoilExtractResult = {
  skipped: boolean;
  reason?: string;
  source?: "cdn" | "override";
  cdnReused?: boolean;
  kitVersion?: string;
  shaders?: { written: string[]; frostVariants: number; uiHologram: boolean };
  textures?: {
    webpWritten: number;
    s3tcWritten: number;
    missing: string[];
    skippedBc7: number;
  };
  masks?: { written: number; skipped: number; failed: number };
  faces?: { written: number; skipped: number; failed: number };
  kitSkipped?: {
    shaders?: boolean;
    textures?: boolean;
    masks?: boolean;
    faces?: boolean;
  };
};

async function resolveBundlesDir(
  opts: RunDbsFwFoilExtractOpts,
): Promise<{
  dir: string;
  source: "cdn" | "override";
  cdn?: EnsureFwClientResult;
} | null> {
  if (opts.bundlesDir) {
    return existsSync(opts.bundlesDir)
      ? { dir: opts.bundlesDir, source: "override" }
      : null;
  }
  if (opts.skipCdn) return null;

  try {
    // Never tie kit `--force` to CDN: unchanged GUS version → no redownload.
    const staged = await ensureFusionWorldClientFromCdn({
      force: opts.forceCdn === true,
      repo: opts.repo,
    });
    return { dir: staged.bundlesDir, source: "cdn", cdn: staged };
  } catch (err) {
    console.warn(
      `── fw foil : CDN staging failed (${err instanceof Error ? err.message : err})`,
    );
    return null;
  }
}

function markKit(
  stamp: FwClientStamp | undefined,
  patch: {
    shadersOk?: boolean;
    texturesOk?: boolean;
    masksOk?: boolean;
    facesOk?: boolean;
  },
  source: "cdn" | "override",
): void {
  if (source !== "cdn" || !stamp) return;
  updateFwClientKit(patch);
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

  const { dir: bundlesDir, source, cdn } = resolved;
  const stamp = cdn?.stamp;
  const cdnReused = cdn?.skipped === true;
  // Fresh CDN extract (version bump / first install) → rebuild kit even if
  // on-disk faces still look "current" from the previous client build.
  const force =
    opts.force === true || (source === "cdn" && cdnReused === false);
  const partial = opts.limit != null || Boolean(opts.match);

  console.log(
    `── fw foil : bundles ← ${source} (${bundlesDir})` +
      (cdn
        ? cdnReused
          ? ` [cdn reuse v${stamp?.version}]`
          : ` [cdn fresh v${stamp?.version}]`
        : ""),
  );

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

  const repo = opts.repo ?? process.cwd();
  const packFoil = foilPackDir(DBS_FW_PACK_ID);
  const texturesDir = join(packFoil, "textures");
  const shadersDir = join(packFoil, "shaders");
  const sidecarModulePath = join(
    repo,
    "src/effects/dbsfw/s3tcSidecars.generated.ts",
  );

  const kitSkipped: RunDbsFwFoilExtractResult["kitSkipped"] = {};
  const kitOpts = {
    force,
    limit: opts.limit,
    match: opts.match,
  };

  let shaders: RunDbsFwFoilExtractResult["shaders"];
  if (foilKitStepFresh(stamp, "shadersOk", kitOpts)) {
    kitSkipped.shaders = true;
    console.log("── fw foil : shaders — skip (kit stamp ok for this version)");
  } else {
    console.log("── fw foil : shaders (FrostCard COUNT variants + UIHologram)");
    shaders = await extractFusionWorldShaders({
      shadersDir,
      bundlesDir,
      force,
    });
    console.log(
      `   shaders : ${shaders.written.length} written / ${shaders.frostVariants} Frost variants` +
        (shaders.uiHologram ? " + UIHologram" : ""),
    );
    if (!partial && shaders.frostVariants > 0) {
      markKit(stamp, { shadersOk: true }, source);
    }
  }

  let textures: RunDbsFwFoilExtractResult["textures"];
  if (foilKitStepFresh(stamp, "texturesOk", kitOpts)) {
    kitSkipped.textures = true;
    console.log("── fw foil : textures — skip (kit stamp ok for this version)");
  } else {
    console.log("── fw foil : shared plates (WebP + S3TC)");
    textures = await extractFusionWorldFoilTextures({
      bundlesDir,
      texturesDir,
      sidecarModulePath,
      force,
    });
    console.log(
      `   textures : webp=${textures.webpWritten} s3tc=${textures.s3tcWritten} ` +
        `missing=${textures.missing.length} bc7skip=${textures.skippedBc7}`,
    );
    if (!partial && textures.missing.length === 0) {
      markKit(stamp, { texturesOk: true }, source);
    }
  }

  let masks: RunDbsFwFoilExtractResult["masks"];
  if (foilKitStepFresh(stamp, "masksOk", kitOpts)) {
    kitSkipped.masks = true;
    console.log("── fw foil : masks — skip (kit stamp ok for this version)");
  } else {
    console.log("── fw foil : per-card masks");
    masks = await extractFusionWorldCardMasks({
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
    if (!partial && masks.failed === 0 && masks.written + masks.skipped > 0) {
      markKit(stamp, { masksOk: true }, source);
    }
  }

  let faces: RunDbsFwFoilExtractResult["faces"];
  if (foilKitStepFresh(stamp, "facesOk", kitOpts)) {
    kitSkipped.faces = true;
    console.log(
      "── fw foil : client faces — skip (already generated for this version)",
    );
  } else {
    console.log("── fw foil : client faces (art.client + layers)");
    faces = await extractFusionWorldCardFaces({
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
    if (!partial && faces.failed === 0 && faces.written + faces.skipped > 0) {
      markKit(stamp, { facesOk: true }, source);
    }
  }

  return {
    skipped: false,
    source,
    cdnReused,
    kitVersion: stamp?.version,
    shaders,
    textures,
    masks,
    faces,
    kitSkipped,
  };
}
