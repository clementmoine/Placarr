/**
 * One Piece Card Game — ligne catalogue locale (vide jusqu'à la moisson).
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  ONEPIECE_EFFECT_PACK_ID,
  ONEPIECE_PACK_ID,
  ONEPIECE_PRINT_GAME,
  ONEPIECE_PROVIDER_ID,
} from "./pack";

export {
  ONEPIECE_EFFECT_PACK_ID,
  ONEPIECE_PACK_ID,
  ONEPIECE_PRINT_GAME,
  ONEPIECE_PROVIDER_ID,
  onepieceCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: ONEPIECE_PROVIDER_ID,
    providerLabel: "One Piece Card Game (local)",
    catalogueLabel: "One Piece Card Game",
    factLabel: "One Piece Card Game",
    packId: ONEPIECE_PACK_ID,
    effectPackId: ONEPIECE_EFFECT_PACK_ID,
    printGame: ONEPIECE_PRINT_GAME,
    defaultLanguage: "en",
    syncHint: "pnpm onepiece:sync",
    websiteUrl: "https://en.onepiece-cardgame.com/cardlist/",
    notes:
      "Bandai OPTCG → `data/onepiece/`. Catalogue local vide (moisson apitcg / vegapull à brancher). Pas de client Unity foil Bandai → face plate.",
  },
  runPipeline: async (argv) => {
    const { runOnepiecePackPipeline } = await import(
      /* webpackIgnore: true */
      "./cli"
    );
    return runOnepiecePackPipeline(argv);
  },
});

export const onepieceLine = built.line;
export const onepieceCatalog = built.catalog;
export const onepieceModule = built.module;
