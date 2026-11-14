/**
 * Dump Fusion World shared foil plates (WebP + DXT/S3TC) from CDN staging.
 * Usage: tsx scripts/extractFusionWorldFoilTextures.ts [--force]
 */
import { join } from "node:path";

import { foilPackDir } from "@/lib/packPaths";
import { ensureFusionWorldClientFromCdn } from "@/providers/dragonball/dbsfw/cdn/ensureClient";
import { DBS_FW_PACK_ID } from "@/providers/dragonball/dbsfw/indexStore";
import { extractFusionWorldFoilTextures } from "@/providers/dragonball/dbsfw/extract/foilTextures";

const force = process.argv.includes("--force");

async function main(): Promise<void> {
  const { bundlesDir } = await ensureFusionWorldClientFromCdn({ force });
  const texturesDir = join(foilPackDir(DBS_FW_PACK_ID), "textures");
  const sidecarModulePath = join(
    process.cwd(),
    "src/effects/dbsfw/s3tcSidecars.generated.ts",
  );
  const stats = await extractFusionWorldFoilTextures({
    bundlesDir,
    texturesDir,
    sidecarModulePath,
    force,
  });
  console.log(JSON.stringify(stats, null, 2));
}

void main();
