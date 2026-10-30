/**
 * Bleach Soul Card Battle — Catalogue Sync / worker.
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `seed` · `faces` · `products`.
 * Faces download is gated by the `faces` step (replaces `--skip-faces`).
 */
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  harvestBleachScbLedgers,
  installBleachScbFromLedgers,
} from "./install/fromLedgers";
import { BLEACH_SCB_PACK_ID, bleachScbCuratedDir } from "./pack";
import { ingestBleachScbSealedProducts } from "./sealed";

export const BLEACH_SCB_STEPS = ["seed", "faces", "products"] as const;
export type BleachScbStep = (typeof BLEACH_SCB_STEPS)[number];
/** Ledger harvest + face CDN downloads need the network. */
const BLEACH_SCB_ONLINE = new Set<BleachScbStep>(["seed", "faces"]);

export function selectBleachScbSteps(argv: readonly string[]): BleachScbStep[] {
  return selectCatalogueSteps(argv, BLEACH_SCB_STEPS, {
    online: BLEACH_SCB_ONLINE,
  });
}

export async function runBleachScbPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const steps = selectBleachScbSteps(argv);
  console.log(
    `── Bleach Soul Card Battle — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  if (steps.includes("seed")) {
    const harvested = await harvestBleachScbLedgers();
    console.log(
      `── Bleach SCB ledgers — FR ${harvested.fr}, JA ${harvested.ja} (nikita), Coleka ${harvested.coleka}, deals ${harvested.colekaPrices}` +
        (harvested.promosCopied || harvested.promosMissing
          ? `, promos +${harvested.promosCopied} (pending ${harvested.promosMissing})`
          : ""),
    );
  }

  return runLocalTcgPipeline({
    packId: BLEACH_SCB_PACK_ID,
    curatedDir: bleachScbCuratedDir(),
    label: "Bleach Soul Card Battle",
    seed: async (index) => {
      if (!steps.includes("seed") && !steps.includes("faces")) {
        return { prints: 0, titles: 0 };
      }
      const installed = await installBleachScbFromLedgers(index, {
        downloadFaces: steps.includes("faces"),
      });
      console.log(
        `── Bleach SCB seed — ${installed.prints} prints, ${installed.titles} titles, ${installed.faces} faces` +
          (installed.rotated
            ? `, ${installed.rotated} JA paysage redressé${installed.rotated === 1 ? "" : "s"}`
            : ""),
      );
      return { prints: installed.prints, titles: installed.titles };
    },
    seedProducts: steps.includes("products")
      ? () => {
          const sealed = ingestBleachScbSealedProducts();
          console.log(
            `── Bleach SCB sealed — ${sealed.written} SKU (skip ${sealed.skipped})`,
          );
          return sealed;
        }
      : undefined,
  });
}
