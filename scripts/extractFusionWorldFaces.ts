/**
 * Decode Fusion World card faces from the installed client.
 * Usage: tsx scripts/extractFusionWorldFaces.ts [--limit N] [--force] [--match sb02-024]
 * Does not modify the game. Writes art.client.webp / back.client.webp
 * beside the prints already on disk.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import { packCardsDir } from "@/lib/packPaths";
import { DBS_FW_PACK_ID } from "@/providers/dragonball/dbsfw/indexStore";
import {
  extractFusionWorldCardFaces,
  reflowFusionWorldClientFaces,
} from "@/providers/dragonball/dbsfw/extract/cardFaces";

const args = process.argv.slice(2);
const limit = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1])
  : undefined;
const match = args.includes("--match")
  ? args[args.indexOf("--match") + 1]
  : undefined;
const force = args.includes("--force");

async function main(): Promise<void> {
  if (args.includes("--reflow")) {
    const stats = await reflowFusionWorldClientFaces({
      cardsDir: packCardsDir(DBS_FW_PACK_ID),
      onProgress: (done, total, widened) => {
        console.log(`${done}/${total}  widened ${widened}`);
      },
    });
    console.log(JSON.stringify(stats));
    return;
  }
  const bundlesDir = join(
    homedir(),
    "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
  );
  const stats = await extractFusionWorldCardFaces({
    bundlesDir,
    force,
    limit: Number.isFinite(limit) ? limit : undefined,
    match,
    onProgress: (done, total, current) => {
      console.log(
        `${done}/${total}  faces ${current.faces}  written ${current.written}  skipped ${current.skipped}  failed ${current.failed}`,
      );
    },
  });
  console.log(JSON.stringify(stats));
}

void main();
