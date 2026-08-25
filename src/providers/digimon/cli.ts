#!/usr/bin/env tsx
/**
 * Digimon Card Game — bootstrap catalogue local vide.
 *
 *   pnpm digimon:sync
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEmptyLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { DIGIMON_PACK_ID, digimonCuratedDir } from "./pack";

export async function runDigimonPackPipeline(
  _argv: readonly string[] = process.argv,
): Promise<{ cards: number; products: number }> {
  return runEmptyLocalTcgPipeline({
    packId: DIGIMON_PACK_ID,
    curatedDir: digimonCuratedDir(),
    label: "Digimon Card Game",
  });
}

const thisFile = fileURLToPath(import.meta.url);
export const DIGIMON_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runDigimonPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
