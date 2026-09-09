/**
 * Naruto Data Carddass pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  harvestArcadeDataCarddass,
  installArcadeDataCarddassFaces,
} from "./arcadeGameCards";
import { buildDataCarddassFromLedgers } from "./buildFromLedgers";
import { installDataCarddassEbayFaces } from "./install/installEbayFaces";
import { ingestDataCarddassSealedProducts } from "./sealedProducts";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "./pack";

export async function runNarutoDataCarddassPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const skipArcade = argv.includes("--skip-arcade");
  if (!skipArcade) {
    try {
      const arcade = await harvestArcadeDataCarddass({ force });
      console.log(
        `── arcadegamecards DCD — ${arcade.cards} fiche(s) : ${arcade.ok} JPEG, ${arcade.skip} déjà là, ${arcade.fail} manqué${arcade.fail === 1 ? "" : "s"}`,
      );
    } catch (err) {
      console.warn(
        `── arcadegamecards DCD — échec : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
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
      const arcadeFaces = installArcadeDataCarddassFaces();
      if (arcadeFaces.faces || arcadeFaces.missing.length) {
        console.log(
          `── Data Carddass arcade : ${arcadeFaces.faces} face(s)${arcadeFaces.missing.length ? `, ${arcadeFaces.missing.length} manquante(s)` : ""}`,
        );
      }
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: async () => ingestDataCarddassSealedProducts(),
  });
}
