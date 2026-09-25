/**
 * Dragon Ball Heroes — local catalogue (JA official carddass.com).
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  DBH_EFFECT_PACK_ID,
  DBH_PACK_ID,
  DBH_PRINT_GAME,
  DBH_PROVIDER_ID,
} from "./pack";
import {
  formatDbhReference,
  normalizeDbhSearchQuery,
} from "./printKey";

export {
  DBH_EFFECT_PACK_ID,
  DBH_PACK_ID,
  DBH_PRINT_GAME,
  DBH_PROVIDER_ID,
  dbhCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: DBH_PROVIDER_ID,
    providerLabel: "Dragon Ball Heroes (local)",
    catalogueLabel: "Dragon Ball Heroes",
    catalogueAliases: [
      { label: "スーパードラゴンボールヒーローズ", language: "ja" },
      { label: "Super Dragon Ball Heroes", language: "en" },
      { label: "SDBH", language: "en" },
    ],
    factLabel: "Dragon Ball Heroes",
    packId: DBH_PACK_ID,
    effectPackId: DBH_EFFECT_PACK_ID,
    printGame: DBH_PRINT_GAME,
    defaultLanguage: "ja",
    listSetLanguages: ["ja"],
    searchPreferLanguage: "ja",
    formatReference: (set, number) => formatDbhReference(set, number),
    normalizeSearchQuery: normalizeDbhSearchQuery,
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://www.carddass.com/dbh/cardlist/",
    notes:
      "Dragon Ball Heroes / Super DBH → `data/dragonball/heroes/`. Cardlist officiel JA carddass.com. Pas de trad EN inventée.",
  },
  runPipeline: async (argv) => {
    const { runDbhPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runDbhPackPipeline(argv);
  },
});

export const dbhLine = built.line;
export const dbhCatalog = built.catalog;
export const dbhModule = built.module;
