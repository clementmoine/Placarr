/**
 * Extract Frost/Card keyword variants + UIHologram from the Mac client.
 * Usage: tsx scripts/extractFusionWorldShaders.ts [--force]
 *
 * Writes `data/dragonball/fw/foil/shaders/FrostCard.frag` and
 * `FrostCard__ARTWORK_ON__EFFECTS_LAYER_COUNT_{ONE,TWO,FIVE,…}.frag`.
 */
import { extractFusionWorldShaders } from "@/providers/dragonball/dbsfw/extract/shaders";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const result = await extractFusionWorldShaders({ force });
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
