/**
 * Dragon Ball Cartes À Jouer Et À Collectionner (Bandai France, 2005-2009) —
 * adaptation française officielle du Dragon Ball Card Game japonais (D-1 à D-938, SP-01 à SP-25).
 *
 * Le catalogue local démarre vide et se remplit via Catalogue Sync (`dbs-jcc`).
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  DBS_JCC_EFFECT_PACK_ID,
  DBS_JCC_PACK_ID,
  DBS_JCC_PRINT_GAME,
  DBS_JCC_PROVIDER_ID,
} from "./pack";
import { decorateDbsjccCandidate } from "./finishes";
import { listDbsjccRemoteSets } from "./listRemoteSets";
import {
  dbsjccSetDisplayCode,
  dbsjccSetLabel,
  dbsjccSetPrefixCode,
  dbsjccSetSortKey,
  formatDbsjccCollectorReference,
  parseDbsjccNumber,
} from "./printKey";
import { resolveDbsjccPrintKeyAlias } from "./printKeyAliases";

export {
  DBS_JCC_EFFECT_PACK_ID,
  DBS_JCC_PACK_ID,
  DBS_JCC_PRINT_GAME,
  DBS_JCC_PROVIDER_ID,
  dbsJccCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: DBS_JCC_PROVIDER_ID,
    providerLabel: "Dragon Ball JCC (local)",
    catalogueLabel: "Dragon Ball Cartes À Jouer Et À Collectionner",
    catalogueAliases: [
      { label: "Dragon Ball JCC", language: "fr" },
      { label: "Dragon Ball CJC", language: "fr" },
      { label: "Dragon Ball Carddass", language: "fr" },
      { label: "Dragon Ball Card Game", language: "en" },
      { label: "ドラゴンボールカードゲーム", language: "ja" },
      { label: "Dragon Ball CCG Bandai France", language: "fr" },
    ],
    factLabel: "Dragon Ball Carddass / JCC",
    packId: DBS_JCC_PACK_ID,
    effectPackId: DBS_JCC_EFFECT_PACK_ID,
    printGame: DBS_JCC_PRINT_GAME,
    catalogLifecycle: "finished",
    /**
     * Adaptation FR Bandai (comme Naruto Carddass) : face / titre FR par défaut.
     * Corpus JA (nikita / Hatatoy) reste dispo via `listSetLanguages`.
     */
    defaultLanguage: "fr",
    listSetLanguages: ["fr", "ja", "en"],
    setLabel: dbsjccSetLabel,
    setDisplayCode: dbsjccSetDisplayCode,
    setPrefixCode: dbsjccSetPrefixCode,
    setSortKey: dbsjccSetSortKey,
    formatReference: formatDbsjccCollectorReference,
    decorateCandidate: decorateDbsjccCandidate,
    normalizeSearchQuery: (query: string) => {
      const parsed = parseDbsjccNumber(query);
      return parsed ?? query;
    },
    listRemotePrintSets: async (language) => listDbsjccRemoteSets(language),
    probePrintKey: "dbsjcc:part1-d0001",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "http://www.dbzcollection.fr/2v2/cartes.php?idc=1",
    notes:
      "Bandai Card Game / JCC (2005–2009) → `data/dragonball/jcc/`. Original JA (nikita DBC titres + Chitoroshop faces) + FR (dbzcollection + carddass.fr/dbz). EN : titres Chitoroshop attestés.",
  },
  runPipeline: async (argv) => {
    const { runDbsJccPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runDbsJccPackPipeline(argv);
  },
});

export const dbsJccLine = built.line;
export const dbsJccCatalog = built.catalog;

const baseLookup = built.module.lookupPrint!;
export const dbsjccModule = {
  ...built.module,
  lookupPrint: async (input: {
    printKey: string;
    language?: string | null;
  }) => {
    const printKey = resolveDbsjccPrintKeyAlias(input.printKey);
    return baseLookup({ ...input, printKey });
  },
};
