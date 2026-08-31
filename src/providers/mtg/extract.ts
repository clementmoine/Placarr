/**
 * Magic: The Gathering pack extract — Catalogue Sync / worker (in-process).
 */
import { runEmptyLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { MTG_PACK_ID, mtgCuratedDir } from "./pack";

export async function runMtgPackPipeline(
  _argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runEmptyLocalTcgPipeline({
    packId: MTG_PACK_ID,
    curatedDir: mtgCuratedDir(),
    label: "Magic: The Gathering",
  });
}

