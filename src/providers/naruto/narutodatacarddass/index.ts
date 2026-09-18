/**
 * Naruto Data Carddass — Bandai arcade (DN / NM / NX), JP only.
 *
 * Autre jeu que le Carddass de table (NI/TE/TA) et le CCG Bandai USA.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  NARUTO_DATA_CARDDASS_EFFECT_PACK_ID,
  NARUTO_DATA_CARDDASS_PACK_ID,
  NARUTO_DATA_CARDDASS_PRINT_GAME,
  NARUTO_DATA_CARDDASS_PROVIDER_ID,
} from "./pack";
import {
  formatDataCarddassReference,
  dataCarddassSetLabel,
  dataCarddassSetSortKey,
  normalizeDataCarddassSearchQuery,
} from "./printKey";

export {
  NARUTO_DATA_CARDDASS_EFFECT_PACK_ID,
  NARUTO_DATA_CARDDASS_PACK_ID,
  NARUTO_DATA_CARDDASS_PRINT_GAME,
  NARUTO_DATA_CARDDASS_PROVIDER_ID,
  narutoDataCarddassCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: NARUTO_DATA_CARDDASS_PROVIDER_ID,
    providerLabel: "Naruto Data Carddass (local)",
    catalogueLabel: "Naruto Data Carddass",
    catalogueAliases: [
      "Data Carddass",
      "データカードダス",
      "Narultimate",
      "Naruto Data Carddass",
    ],
    factLabel: "Data Carddass",
    packId: NARUTO_DATA_CARDDASS_PACK_ID,
    effectPackId: NARUTO_DATA_CARDDASS_EFFECT_PACK_ID,
    printGame: NARUTO_DATA_CARDDASS_PRINT_GAME,
    defaultLanguage: "ja",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://www.suruga-ya.com/en/category/501080113",
    formatReference: formatDataCarddassReference,
    setLabel: dataCarddassSetLabel,
    setSortKey: dataCarddassSetSortKey,
    normalizeSearchQuery: normalizeDataCarddassSearchQuery,
    notes:
      "Bandai Data Carddass arcade (ナルティメット…) → `data/naruto/data-carddass/`. Préfixes DN / NM / NX. Autre jeu que Carddass de table et CCG USA.",
  },
  runPipeline: async (argv) => {
    const { runNarutoDataCarddassPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runNarutoDataCarddassPackPipeline(argv);
  },
});

export const narutoDataCarddassLine = built.line;
export const narutoDataCarddassCatalog = built.catalog;
export const narutodatacarddassModule = built.module;
