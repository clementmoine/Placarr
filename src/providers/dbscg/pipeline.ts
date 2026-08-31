/**
 * Crochets de catalogue du pack `dbs/cg`.
 *
 * Le corps est commun à tous les packs de cartes — voir
 * `shared/cardCatalogue/pipeline`. Ne reste ici que ce qui est propre au pack :
 * sa base, son pipeline, et ce qu'une passe automatique s'autorise.
 */
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { dbsCgDbPath, DBS_CG_PACK_ID } from "./indexStore";

const hooks = cardCatalogueHooks({
  packId: DBS_CG_PACK_ID,
  dbPath: dbsCgDbPath,
  runPipeline: async (argv) => {
    const { runDbsCgPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runDbsCgPackPipeline(argv);
  },
  /*
    Le graphe produit vit sur le même hôte que `dbscards`, qui ralentit les
    rafales : soixante-dix fiches, c'est un clic, pas un battement d'horloge.
  */
  autoSkip: ["products"],
});

export const refreshDbsCgCatalog = hooks.refresh;
export const dbsCgCatalogStatus = hooks.status;
export const dbscgCatalog: ProviderCatalogHooks = hooks;
