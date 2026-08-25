#!/usr/bin/env tsx
/**
 * Yu-Gi-Oh! — bootstrap catalogue local vide.
 *
 *   pnpm yugioh:sync
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEmptyLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { YUGIOH_PACK_ID, yugiohCuratedDir } from "./pack";

export async function runYugiohPackPipeline(
  _argv: readonly string[] = process.argv,
): Promise<{ cards: number; products: number }> {
  return runEmptyLocalTcgPipeline({
    packId: YUGIOH_PACK_ID,
    curatedDir: yugiohCuratedDir(),
    label: "Yu-Gi-Oh!",
  });
}

const thisFile = fileURLToPath(import.meta.url);
export const YUGIOH_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runYugiohPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
