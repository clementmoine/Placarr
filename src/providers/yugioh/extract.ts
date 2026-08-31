/**
 * Yu-Gi-Oh! pack extract — Catalogue Sync / worker (in-process).
 */
import { runEmptyLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { YUGIOH_PACK_ID, yugiohCuratedDir } from "./pack";

export async function runYugiohPackPipeline(
  _argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runEmptyLocalTcgPipeline({
    packId: YUGIOH_PACK_ID,
    curatedDir: yugiohCuratedDir(),
    label: "Yu-Gi-Oh!",
  });
}

