/**
 * Crochets de catalogue du pack `dragonball/fw`.
 *
 * Le corps est commun à tous les packs de cartes — voir
 * `shared/cardCatalogue/pipeline`. Ne reste ici que ce qui est propre au pack :
 * sa base et son pipeline.
 */
import { DBS_FW_EFFECT_PACK_ID } from "@/effects/dbsfw";
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { dbsFwDbPath, DBS_FW_PACK_ID } from "../indexStore";

const hooks = cardCatalogueHooks({
  packId: DBS_FW_PACK_ID,
  effectPackId: DBS_FW_EFFECT_PACK_ID,
  dbPath: dbsFwDbPath,
  runPipeline: async (argv) => {
    const { runDbsFwPackPipeline } = await import(
      /* webpackIgnore: true */
      "../extract"
    );
    return runDbsFwPackPipeline(argv);
  },
});

export const refreshDbsFwCatalog = hooks.refresh;
export const dbsFwCatalogStatus = hooks.status;
export const dbsfwCatalog: ProviderCatalogHooks = hooks;
