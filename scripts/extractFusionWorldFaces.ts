/**
 * Decode Fusion World card faces from CDN staging.
 * Usage:
 *   tsx scripts/extractFusionWorldFaces.ts [--limit N] [--force] [--match sb02-024]
 *   [--force-cdn]
 *
 * `--force` rewrites art.client / layers. `--force-cdn` re-downloads the
 * Xsolla 7z (rare) — do not pass it for a normal face rebuild.
 */
import { packCardsDir } from "@/lib/packPaths";
import { ensureFusionWorldClientFromCdn } from "@/providers/dragonball/dbsfw/cdn/ensureClient";
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
const forceCdn = args.includes("--force-cdn");

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
  const { bundlesDir } = await ensureFusionWorldClientFromCdn({
    force: forceCdn,
  });
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
