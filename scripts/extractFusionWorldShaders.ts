/**
 * Extract Frost/Card keyword variants + UIHologram via CDN staging.
 * Usage: tsx scripts/extractFusionWorldShaders.ts [--force]
 *
 * Prefer Catalogue Sync (Fusion World → étape `foil`) for the full kit.
 */
import { ensureFusionWorldClientFromCdn } from "@/providers/dragonball/dbsfw/cdn/ensureClient";
import { extractFusionWorldShaders } from "@/providers/dragonball/dbsfw/extract/shaders";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const { bundlesDir } = await ensureFusionWorldClientFromCdn({ force });
  const result = await extractFusionWorldShaders({ force, bundlesDir });
  console.log(
    `── fw shaders : ${result.written.length} written, ` +
      `${result.frostVariants} Frost variants` +
      (result.uiHologram ? ", UIHologram ok" : ", UIHologram missing"),
  );
  for (const name of result.written) console.log(`   + ${name}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
