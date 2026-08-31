/**
 * Digimon Card Game pack extract — Catalogue Sync / worker (in-process).
 */
import { runEmptyLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { DIGIMON_PACK_ID, digimonCuratedDir } from "./pack";

export async function runDigimonPackPipeline(
  _argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runEmptyLocalTcgPipeline({
    packId: DIGIMON_PACK_ID,
    curatedDir: digimonCuratedDir(),
    label: "Digimon Card Game",
  });
}

