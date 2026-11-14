/**
 * Dump Fusion World shared foil plates (WebP + DXT/S3TC sidecars).
 * Usage: tsx scripts/extractFusionWorldFoilTextures.ts [--force]
 * Does not modify the game.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import { foilPackDir } from "@/lib/packPaths";
import { DBS_FW_PACK_ID } from "@/providers/dragonball/dbsfw/indexStore";
import { extractFusionWorldFoilTextures } from "@/providers/dragonball/dbsfw/extract/foilTextures";

const force = process.argv.includes("--force");

async function main(): Promise<void> {
  const bundlesDir = join(
    homedir(),
    "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
  );
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
