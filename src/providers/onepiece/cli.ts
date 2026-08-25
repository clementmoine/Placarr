#!/usr/bin/env tsx
/**
 * One Piece Card Game — bootstrap catalogue local vide.
 *
 *   pnpm onepiece:sync
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEmptyLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { ONEPIECE_PACK_ID, onepieceCuratedDir } from "./pack";

export async function runOnepiecePackPipeline(
  _argv: readonly string[] = process.argv,
): Promise<{ cards: number; products: number }> {
  return runEmptyLocalTcgPipeline({
    packId: ONEPIECE_PACK_ID,
    curatedDir: onepieceCuratedDir(),
    label: "One Piece Card Game",
  });
}

const thisFile = fileURLToPath(import.meta.url);
export const ONEPIECE_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runOnepiecePackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
