/**
 * Naruto Card Game — Bandai Card Games (lancement mondial été 2027).
 * Ligne distincte du Carddass / CCG legacy, Mythos, Kayou, etc.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  NARUTO_CARDGAME_EFFECT_PACK_ID,
  NARUTO_CARDGAME_PACK_ID,
  NARUTO_CARDGAME_PRINT_GAME,
  NARUTO_CARDGAME_PROVIDER_ID,
} from "./pack";
import {
  formatNarutoCardgameReference,
  narutoCardgamePrintKey,
  narutoCardgameSetLabel,
  narutoCardgameSetSortKey,
} from "./printKey";

export {
  NARUTO_CARDGAME_EFFECT_PACK_ID,
  NARUTO_CARDGAME_PACK_ID,
  NARUTO_CARDGAME_PRINT_GAME,
  NARUTO_CARDGAME_PROVIDER_ID,
  narutoCardgameCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: NARUTO_CARDGAME_PROVIDER_ID,
    providerLabel: "Naruto Card Game (Bandai 2027)",
    catalogueLabel: "Naruto Card Game",
    catalogueAliases: [
      { label: "Naruto Card Game Bandai", language: "en" },
      { label: "NARUTO CARD GAME", language: "ja" },
    ],
    factLabel: "Naruto Card Game",
    packId: NARUTO_CARDGAME_PACK_ID,
    effectPackId: NARUTO_CARDGAME_EFFECT_PACK_ID,
    printGame: NARUTO_CARDGAME_PRINT_GAME,
    defaultLanguage: "fr",
    catalogLifecycle: "living",
    listSetLanguages: ["fr", "en"],
    searchPreferLanguage: "fr",
    formatReference: (set, number) =>
      formatNarutoCardgameReference(set, number),
    setLabel: narutoCardgameSetLabel,
    setSortKey: narutoCardgameSetSortKey,
    probePrintKey:
      narutoCardgamePrintKey("preview", "g01") ?? "narutocardgame:preview-g01",
    syncHint:
      "Catalogue Sync (admin) — galerie SAMPLE Bandai + display FR précommande",
    websiteUrl: "https://www.naruto-cardgame.com/en/welcome/",
    notes:
      "Bandai Card Games + Asmodee EU — nouveau TCG mondial (été 2027) → `data/naruto/cardgame/`. Pas le Carddass / CCG legacy. 12 Character SAMPLE (galerie officielle EN+JP) + display FR Pixel Heart ; checklist retail encore absente.",
  },
  runPipeline: async (argv) => {
    const { runNarutoCardgamePackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runNarutoCardgamePackPipeline(argv);
  },
});

export const narutoCardgameLine = built.line;
export const narutoCardgameCatalog = built.catalog;
export const narutocardgameModule = built.module;
