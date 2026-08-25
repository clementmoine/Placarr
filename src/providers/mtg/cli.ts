#!/usr/bin/env tsx
/**
 * Magic: The Gathering — bootstrap catalogue local vide.
 *
 *   pnpm mtg:sync
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEmptyLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { MTG_PACK_ID, mtgCuratedDir } from "./pack";

export async function runMtgPackPipeline(
  _argv: readonly string[] = process.argv,
): Promise<{ cards: number; products: number }> {
  return runEmptyLocalTcgPipeline({
    packId: MTG_PACK_ID,
    curatedDir: mtgCuratedDir(),
    label: "Magic: The Gathering",
  });
}

const thisFile = fileURLToPath(import.meta.url);
export const MTG_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runMtgPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
