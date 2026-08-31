/**
 * Yu-Gi-Oh! — ligne catalogue locale (vide jusqu'à la moisson).
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  YUGIOH_EFFECT_PACK_ID,
  YUGIOH_PACK_ID,
  YUGIOH_PRINT_GAME,
  YUGIOH_PROVIDER_ID,
} from "./pack";

export {
  YUGIOH_EFFECT_PACK_ID,
  YUGIOH_PACK_ID,
  YUGIOH_PRINT_GAME,
  YUGIOH_PROVIDER_ID,
  yugiohCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: YUGIOH_PROVIDER_ID,
    providerLabel: "Yu-Gi-Oh! (local)",
    catalogueLabel: "Yu-Gi-Oh!",
    factLabel: "Yu-Gi-Oh!",
    packId: YUGIOH_PACK_ID,
    effectPackId: YUGIOH_EFFECT_PACK_ID,
    printGame: YUGIOH_PRINT_GAME,
    defaultLanguage: "en",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://ygoprodeck.com/",
    notes:
      "Yu-Gi-Oh! TCG → `data/yugioh/`. Catalogue local vide (YGOPRODeck à brancher). Catalogue-only.",
  },
  runPipeline: async (argv) => {
    const { runYugiohPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runYugiohPackPipeline(argv);
  },
});

export const yugiohLine = built.line;
export const yugiohCatalog = built.catalog;
export const yugiohModule = built.module;
