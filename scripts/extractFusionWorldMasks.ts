/**
 * Decode Fusion World card masks from CDN staging.
 * Usage: tsx scripts/extractFusionWorldMasks.ts [--limit N] [--force]
 */
import { ensureFusionWorldClientFromCdn } from "@/providers/dragonball/dbsfw/cdn/ensureClient";
import { extractFusionWorldCardMasks } from "@/providers/dragonball/dbsfw/extract/cardMasks";

const args = process.argv.slice(2);
const limit = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1])
  : undefined;
const force = args.includes("--force");

async function main(): Promise<void> {
  const { bundlesDir } = await ensureFusionWorldClientFromCdn({ force });
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
