/**
 * Rebuild des index d'identification (visuel + embeddings) d'un pack — dev.
 * En produit, la Sync catalogue le fait.
 *
 *   pnpm tsx scripts/runIdentifyRebuild.ts <pack>   # ex. pokemon, lorcana
 */
import { runDataPackCardIdentifyIndexes } from "@/providers/shared/cardCatalogue/identifyIndexesStep";

async function main(): Promise<void> {
  const pack = process.argv[2]?.trim();
  if (!pack) throw new Error("usage : runIdentifyRebuild.ts <pack>");
  await runDataPackCardIdentifyIndexes(pack, {
    onLog: (line) => console.log(line),
  });
  console.log(`── identify rebuild done (${pack})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
