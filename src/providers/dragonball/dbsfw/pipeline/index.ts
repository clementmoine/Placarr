/**
 * Crochets de catalogue du pack `dragonball/fw`.
 *
 * Le corps est commun à tous les packs de cartes — voir
 * `shared/cardCatalogue/pipeline`. Ne reste ici que ce qui est propre au pack :
 * sa base et son pipeline.
 */
import { DBS_FW_EFFECT_PACK_ID } from "@/effects/dbsfw";
import type {
  ProviderCatalogHooks,
  ProviderClientOpts,
  ProviderClientOutcome,
} from "@/types/providerModule";
import { withCardnexusPackFacesStep } from "@/providers/commerce/cardnexus/fillPackFaces";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { dbsFwDbPath, DBS_FW_PACK_ID } from "../indexStore";
import { DBS_FW_GAME } from "../identity";

const hooks = cardCatalogueHooks({
  packId: DBS_FW_PACK_ID,
  effectPackId: DBS_FW_EFFECT_PACK_ID,
  printGame: DBS_FW_GAME,
  dbPath: dbsFwDbPath,
  runPipeline: withCardnexusPackFacesStep(
    { packId: DBS_FW_PACK_ID, printGame: DBS_FW_GAME },
    async (argv) => {
      const { runDbsFwPackPipeline } = await import(
        /* webpackIgnore: true */
        "../extract"
      );
      return runDbsFwPackPipeline(argv);
    },
  ),
});

export const refreshDbsFwCatalog = hooks.refresh;
export const dbsFwCatalogStatus = hooks.status;
/**
 * Client du jeu = volumes GUS du CDN Xsolla (ADR-026) : téléchargés seulement
 * quand la version change ; l'étape `foil` lit le client posé.
 */
async function ensureFusionWorldClient(
  opts: ProviderClientOpts = {},
): Promise<ProviderClientOutcome> {
  const { ensureFusionWorldClientFromCdn } = await import(
    /* webpackIgnore: true */
    "../cdn/ensureClient"
  );
  try {
    const staged = await ensureFusionWorldClientFromCdn({ force: opts.force });
    const version = staged.stamp.version;
    return staged.skipped
      ? { status: "up-to-date", version }
      : { status: "updated", version };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export const dbsfwCatalog: ProviderCatalogHooks = {
  ...hooks,
  ensureClient: ensureFusionWorldClient,
};
