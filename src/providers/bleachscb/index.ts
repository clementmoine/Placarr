/**
 * Bleach Soul Card Battle (Bandai Carddass) — local multilingual catalogue.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  BLEACH_SCB_EFFECT_PACK_ID,
  BLEACH_SCB_PACK_ID,
  BLEACH_SCB_PRINT_GAME,
  BLEACH_SCB_PROVIDER_ID,
} from "./pack";
import {
  formatBleachScbReference,
  normalizeBleachScbSearchQuery,
} from "./printKey";

export {
  BLEACH_SCB_EFFECT_PACK_ID,
  BLEACH_SCB_PACK_ID,
  BLEACH_SCB_PRINT_GAME,
  BLEACH_SCB_PROVIDER_ID,
  bleachScbCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: BLEACH_SCB_PROVIDER_ID,
    providerLabel: "Bleach Soul Card Battle (local)",
    catalogueLabel: "Bleach Soul Card Battle",
    catalogueAliases: [
      { label: "Bleach Carddass", language: "en" },
      { label: "Bleach JCC", language: "fr" },
      { label: "BLEACH ソウルカードバトル", language: "ja" },
    ],
    factLabel: "Bleach Soul Card Battle",
    packId: BLEACH_SCB_PACK_ID,
    effectPackId: BLEACH_SCB_EFFECT_PACK_ID,
    printGame: BLEACH_SCB_PRINT_GAME,
    defaultLanguage: "ja",
    listSetLanguages: ["ja", "fr"],
    searchPreferLanguage: "ja",
    formatReference: (set, number) => formatBleachScbReference(set, number),
    normalizeSearchQuery: normalizeBleachScbSearchQuery,
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "http://www.carddass.fr/bleach/",
    notes:
      "Bandai Soul Card Battle (Carddass) → `data/bleach/scb/`. Original JA (nikita S-/B-/E-/Z-) + FR (carddass.fr A/C/E/Z). Pas Union Arena ni Bleach TCG Score US.",
  },
  runPipeline: async (argv) => {
    const { runBleachScbPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runBleachScbPackPipeline(argv);
  },
});

export const bleachScbLine = built.line;
export const bleachScbCatalog = built.catalog;
export const bleachscbModule = built.module;
