/**
 * Bleach Soul Card Battle — Catalogue Sync / worker.
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  harvestBleachScbLedgers,
  installBleachScbFromLedgers,
} from "./buildFromLedgers";
import { BLEACH_SCB_PACK_ID, bleachScbCuratedDir } from "./pack";
import { ingestBleachScbSealedProducts } from "./sealedProducts";

export async function runBleachScbPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const skipFaces = argv.includes("--skip-faces");
  const harvested = await harvestBleachScbLedgers();
  console.log(
    `── Bleach SCB ledgers — FR ${harvested.fr}, JA ${harvested.ja} (nikita), Coleka ${harvested.coleka}`,
  );

  return runLocalTcgPipeline({
    packId: BLEACH_SCB_PACK_ID,
    curatedDir: bleachScbCuratedDir(),
    label: "Bleach Soul Card Battle",
    seed: async (index) => {
      const installed = await installBleachScbFromLedgers(index, {
        downloadFaces: !skipFaces,
      });
      console.log(
        `── Bleach SCB seed — ${installed.prints} prints, ${installed.titles} titles, ${installed.faces} faces` +
          (installed.rotated
            ? `, ${installed.rotated} JA paysage redressé${installed.rotated === 1 ? "" : "s"}`
            : ""),
      );
      return { prints: installed.prints, titles: installed.titles };
    },
    seedProducts: () => {
      const sealed = ingestBleachScbSealedProducts();
      console.log(
        `── Bleach SCB sealed — ${sealed.written} SKU (skip ${sealed.skipped})`,
      );
      return sealed;
    },
  });
}
