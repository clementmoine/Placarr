/**
 * Crochets de catalogue du pack `dragonball/cg`.
 *
 * Le corps est commun à tous les packs de cartes — voir
 * `shared/cardCatalogue/pipeline`. Ne reste ici que ce qui est propre au pack :
 * sa base et son pipeline.
 */
import { DBS_CG_EFFECT_PACK_ID } from "@/effects/dbscg";
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { dbsCgDbPath, DBS_CG_PACK_ID } from "../indexStore";

const hooks = cardCatalogueHooks({
  packId: DBS_CG_PACK_ID,
  effectPackId: DBS_CG_EFFECT_PACK_ID,
  dbPath: dbsCgDbPath,
  runPipeline: async (argv) => {
    const { runDbsCgPackPipeline } = await import(
      /* webpackIgnore: true */
      "../extract"
    );
    return runDbsCgPackPipeline(argv);
  },
});

export const refreshDbsCgCatalog = hooks.refresh;
export const dbsCgCatalogStatus = hooks.status;
export const dbscgCatalog: ProviderCatalogHooks = hooks;
