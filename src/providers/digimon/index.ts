/**
 * Digimon Card Game — ligne catalogue locale (vide jusqu'à la moisson).
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  DIGIMON_EFFECT_PACK_ID,
  DIGIMON_PACK_ID,
  DIGIMON_PRINT_GAME,
  DIGIMON_PROVIDER_ID,
} from "./pack";

export {
  DIGIMON_EFFECT_PACK_ID,
  DIGIMON_PACK_ID,
  DIGIMON_PRINT_GAME,
  DIGIMON_PROVIDER_ID,
  digimonCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: DIGIMON_PROVIDER_ID,
    providerLabel: "Digimon Card Game (local)",
    catalogueLabel: "Digimon Card Game",
    factLabel: "Digimon Card Game",
    packId: DIGIMON_PACK_ID,
    effectPackId: DIGIMON_EFFECT_PACK_ID,
    printGame: DIGIMON_PRINT_GAME,
    defaultLanguage: "en",
    syncHint: "pnpm digimon:sync",
    websiteUrl: "https://digimoncard.io/",
    notes:
      "Bandai Digimon Card Game → `data/digimon/`. Catalogue local vide (digimoncard.io / apitcg à brancher). Catalogue-only, pas de foil dump.",
  },
  runPipeline: async (argv) => {
    const { runDigimonPackPipeline } = await import(
      /* webpackIgnore: true */
      "./cli"
    );
    return runDigimonPackPipeline(argv);
  },
});

export const digimonLine = built.line;
export const digimonCatalog = built.catalog;
export const digimonModule = built.module;
