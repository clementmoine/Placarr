/**
 * Crochets de catalogue du pack `dbs/fw`.
 *
 * Le corps est commun à tous les packs de cartes — voir
 * `shared/cardCatalogue/pipeline`. Ne reste ici que ce qui est propre au pack :
 * sa base, son pipeline, et ce qu'une passe automatique s'autorise.
 */
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { dbsFwDbPath, DBS_FW_PACK_ID } from "./indexStore";

const hooks = cardCatalogueHooks({
  packId: DBS_FW_PACK_ID,
  dbPath: dbsFwDbPath,
  runPipeline: async (argv) => {
    const { runDbsFwPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runDbsFwPackPipeline(argv);
  },
  // Même partage que les Masters : la synchro admin prend le graphe produit.
  autoSkip: ["products"],
});

export const refreshDbsFwCatalog = hooks.refresh;
export const dbsFwCatalogStatus = hooks.status;
export const dbsfwCatalog: ProviderCatalogHooks = hooks;
