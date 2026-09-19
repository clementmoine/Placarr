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
import {
  formatYugiohReference,
  normalizeYugiohSearchQuery,
} from "./printKey";

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
    /** TCG original language is English; FR via YGOPRODeck + ScanFlip. */
    defaultLanguage: "en",
    catalogLifecycle: "living",
    listSetLanguages: ["en", "fr"],
    formatReference: (set, number) => formatYugiohReference(set, number),
    normalizeSearchQuery: normalizeYugiohSearchQuery,
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://www.db.yugioh-card.com/yugiohdb/",
    notes:
      "Yu-Gi-Oh! TCG → `data/yugioh/`. YGOPRODeck (EN+FR names, images) + ScanFlip FR (codes LDD-F…). Konami Neuron sans API publique.",
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
