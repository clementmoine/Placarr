/**
 * Naruto Data Carddass pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { buildDataCarddassFromLedgers } from "./buildFromLedgers";
import { installDataCarddassEbayFaces } from "./install/installEbayFaces";
import { ingestDataCarddassSealedProducts } from "./sealedProducts";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "./pack";

export async function runNarutoDataCarddassPackPipeline(
  _argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  return runLocalTcgPipeline({
    packId: NARUTO_DATA_CARDDASS_PACK_ID,
    curatedDir: narutoDataCarddassCuratedDir(),
    label: "Naruto Data Carddass",
    seed: async (index) => {
      const built = buildDataCarddassFromLedgers({ index });
      if (built.skipped.length) {
        console.log(
          `── Data Carddass — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
        );
      }
      const faces = await installDataCarddassEbayFaces({ index });
      if (
        faces.written.length ||
        faces.skipped.length ||
        faces.failed.length
      ) {
        console.log(
          `── Data Carddass eBay : ${faces.written.length} écrits, ${faces.skipped.length} sautés, ${faces.failed.length} échecs`,
        );
      }
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: async () => ingestDataCarddassSealedProducts(),
  });
}
