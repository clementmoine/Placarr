/**
 * Naruto Défi Ninja — 404 Éditions (2023), jeu de 50 cartes FR.
 *
 * Autre jeu que le Carddass / Ultra Challenge / Mythos / Data Carddass.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  NARUTO_DEFI_NINJA_EFFECT_PACK_ID,
  NARUTO_DEFI_NINJA_PACK_ID,
  NARUTO_DEFI_NINJA_PRINT_GAME,
  NARUTO_DEFI_NINJA_PROVIDER_ID,
} from "./pack";
import {
  formatDefiNinjaReference,
  defiNinjaSetLabel,
  defiNinjaSetSortKey,
  normalizeDefiNinjaSearchQuery,
} from "./printKey";

export {
  NARUTO_DEFI_NINJA_EFFECT_PACK_ID,
  NARUTO_DEFI_NINJA_PACK_ID,
  NARUTO_DEFI_NINJA_PRINT_GAME,
  NARUTO_DEFI_NINJA_PROVIDER_ID,
  narutoDefiNinjaCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: NARUTO_DEFI_NINJA_PROVIDER_ID,
    providerLabel: "Naruto Défi Ninja (local)",
    catalogueLabel: "Naruto Défi Ninja",
    catalogueAliases: ["Défi Ninja", "Le défi ninja", "Naruto Défi Ninja"],
    factLabel: "Défi Ninja",
    packId: NARUTO_DEFI_NINJA_PACK_ID,
    effectPackId: NARUTO_DEFI_NINJA_EFFECT_PACK_ID,
    printGame: NARUTO_DEFI_NINJA_PRINT_GAME,
    defaultLanguage: "fr",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl:
      "https://www.e.leclerc/fp/naruto-mon-jeu-de-cartes-le-defi-ninja-broche-9791032407592",
    formatReference: formatDefiNinjaReference,
    setLabel: defiNinjaSetLabel,
    setSortKey: defiNinjaSetSortKey,
    normalizeSearchQuery: normalizeDefiNinjaSearchQuery,
    notes:
      "404 Éditions — Naruto Mon jeu de cartes Le défi ninja (EAN 9791032407592, 50 cartes) → `data/naruto/defi-ninja/`. Autre jeu que Carddass, Ultra Challenge, Mythos et Data Carddass.",
  },
  runPipeline: async (argv) => {
    const { runNarutoDefiNinjaPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runNarutoDefiNinjaPackPipeline(argv);
  },
});

export const narutoDefiNinjaLine = built.line;
export const narutoDefiNinjaCatalog = built.catalog;
export const narutodefininjaModule = built.module;
