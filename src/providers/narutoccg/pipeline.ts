/**
 * Crochets de catalogue du pack `naruto/carddass`.
 *
 * Corps commun : `shared/cardCatalogue/pipeline`. En automatique : `--offline`
 * (pas de re-téléchargement de faces) et skip de la checklist longue.
 */
import type { ProviderCatalogHooks } from "@/types/providerModule";
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";

import { narutoCcgDbPath } from "./indexStore";

const DATA_PACK = "naruto/carddass";

const hooks = cardCatalogueHooks({
  packId: DATA_PACK,
  dbPath: narutoCcgDbPath,
  runPipeline: async (argv) => {
    /*
      Never `process.argv`: this runs inside the background worker, whose own
      arguments have nothing to do with the pack. Reading them let unrelated
      flags leak into the pipeline — and made the same call behave differently
      depending on who invoked it.
    */
    const { runNarutoPackPipeline } = await import(
      /* webpackIgnore: true */
      "./cli"
    );
    return runNarutoPackPipeline(argv);
  },
  autoExtraArgs: ["--offline"],
  autoSkip: ["checklist"],
});

export const refreshNarutoCcgCatalog = hooks.refresh;
export const narutoCcgCatalogStatus = hooks.status;
export const narutoccgCatalog: ProviderCatalogHooks = hooks;
