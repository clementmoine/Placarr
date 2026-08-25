/**
 * Crochets de catalogue du pack `lorcana`.
 *
 * Corps commun : `shared/cardCatalogue/pipeline`. Ici : la moisson cartes +
 * le graphe produits lorcards.fr (sauté en automatique).
 *
 * L'extract Unity / foil reste sur la CLI (`pnpm foil:lorcana`) et la route
 * foilExtract — ce pipeline ne le lance pas.
 */
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { lorcanaTcgDbPath } from "./indexStore";
import { scrapeLorcardsProducts } from "./lorcards";
import { scrapeLorcanaCards } from "./scrapeCards";

const LORCANA_PACK_ID = "lorcana";

const hooks = cardCatalogueHooks({
  packId: LORCANA_PACK_ID,
  dbPath: lorcanaTcgDbPath,
  runPipeline: async (argv) => {
    /*
      Manual Sync : force rebuild + produits. Horaire : `--skip products` —
      pas de force (réutilise le cache cartes), pas de graphe lorcards.
    */
    const skipProducts = argv.includes("products");
    await scrapeLorcanaCards({ force: !skipProducts });
    if (!skipProducts) {
      await scrapeLorcardsProducts({});
    }
  },
  autoSkip: ["products"],
});

export const refreshLorcanaTcgCatalog = hooks.refresh;
export const lorcanaTcgCatalogStatus = hooks.status;
export const lorcanatcgCatalog: ProviderCatalogHooks = hooks;
