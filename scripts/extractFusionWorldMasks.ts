/**
 * Decode every Fusion World card mask from the installed client.
 * Usage: tsx scripts/extractFusionWorldMasks.ts [--limit N] [--force]
 * Does not modify the game.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import { extractFusionWorldCardMasks } from "@/providers/dragonball/dbsfw/extract/cardMasks";

const args = process.argv.slice(2);
const limit = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1])
  : undefined;
const force = args.includes("--force");

async function main(): Promise<void> {
  const bundlesDir = join(
    homedir(),
    "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
  );
  const stats = await extractFusionWorldCardMasks({
    bundlesDir,
    force,
    limit: Number.isFinite(limit) ? limit : undefined,
    onProgress: (done, total, current) => {
      console.log(
        `${done}/${total}  written ${current.written}  skipped ${current.skipped}  failed ${current.failed}`,
      );
    },
  });
  console.log(JSON.stringify(stats));
}

void main();
