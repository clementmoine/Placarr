#!/usr/bin/env tsx
/**
 * Naruto Ultra Challenge — album + pochette (upscales) ; cartes encore vides.
 *
 *   pnpm naruto:ultra
 *   pnpm naruto:ultra -- --force
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { harvestColekaAlbum } from "./colekaAlbum";
import { ingestUltraSealedProducts } from "./sealedProducts";
import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";

export async function runNarutoUltraPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const harvested = await harvestColekaAlbum({ force });
  console.log(
    `── Coleka album — ${harvested.ok} visuel, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
  );
  return runLocalTcgPipeline({
    packId: NARUTO_ULTRA_PACK_ID,
    curatedDir: narutoUltraCuratedDir(),
    label: "Naruto Ultra Challenge",
    seedProducts: () => ingestUltraSealedProducts(),
  });
}

const thisFile = fileURLToPath(import.meta.url);
export const NARUTO_ULTRA_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runNarutoUltraPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
