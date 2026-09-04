/**
 * Naruto Défi Ninja pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { buildDefiNinjaFromLedgers } from "./buildFromLedgers";
import { ingestDefiNinjaSealedProducts } from "./sealedProducts";
import {
  NARUTO_DEFI_NINJA_PACK_ID,
  narutoDefiNinjaCuratedDir,
} from "./pack";

export async function runNarutoDefiNinjaPackPipeline(
  _argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runLocalTcgPipeline({
    packId: NARUTO_DEFI_NINJA_PACK_ID,
    curatedDir: narutoDefiNinjaCuratedDir(),
    label: "Naruto Défi Ninja",
    seed: (index) => {
      const built = buildDefiNinjaFromLedgers({ index });
      if (built.skipped.length) {
        console.log(
          `── Défi Ninja — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
        );
      }
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: async () => ingestDefiNinjaSealedProducts(),
  });
}
