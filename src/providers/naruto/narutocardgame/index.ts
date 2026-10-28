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
} from "./pack";
export { narutoCardgameCuratedDir } from "./curatedPaths";

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
    /** JA original + EN + FR (aligné catalogueLocales admin). */
    listSetLanguages: ["ja", "fr", "en"],
    searchPreferLanguage: "fr",
    borrowFaceAcrossLocales: true,
    formatReference: (set, number) =>
      formatNarutoCardgameReference(set, number),
    setLabel: narutoCardgameSetLabel,
    setSortKey: narutoCardgameSetSortKey,
    probePrintKey:
      narutoCardgamePrintKey("preview", "g01") ?? "narutocardgame:preview-g01",
    syncHint:
      "Catalogue Sync — galerie Bandai EN+JP + narutomarket FR/JA + play#sim + narutocardguide + Fest Premium + display FR",
    websiteUrl: "https://www.naruto-cardgame.com/en/welcome/",
    notes:
      "Bandai Card Games + Asmodee EU — TCG mondial (été 2027) → `data/naruto/cardgame/`. Galerie SAMPLE officielle EN+JP ; checklist FR/JA via narutomarket.com ; simulateur `/play#sim` (NM_SIM_CARDS, noms JA) ; hubs narutotcgcards.com + narutocardguide.com/cards-list/ ; Premium vol.00 JP (BANDAI CARD GAMES Fest) ; displays launch FR/EN (Pixel Heart) + Display/Case JP (Deck Dynastie). Portail CN : naruto-ncg.cn (SPA, pas encore de dump cartes).",
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
