/**
 * One Piece Card Game — ligne catalogue locale (punk-records + faces Bandai).
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  ONEPIECE_EFFECT_PACK_ID,
  ONEPIECE_PACK_ID,
  ONEPIECE_PRINT_GAME,
  ONEPIECE_PROVIDER_ID,
} from "./pack";
import { stampOnepieceBack } from "./onepieceBack";
import { formatOnepieceReference } from "./printIdentity";

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
    catalogueAliases: ["OPTCG", "One Piece"],
    factLabel: "One Piece Card Game",
    packId: ONEPIECE_PACK_ID,
    effectPackId: ONEPIECE_EFFECT_PACK_ID,
    printGame: ONEPIECE_PRINT_GAME,
    defaultLanguage: "fr",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://en.onepiece-cardgame.com/cardlist/",
    formatReference: formatOnepieceReference,
    borrowFaceAcrossLocales: true,
    decorateCandidate: (candidate) => stampOnepieceBack(candidate),
    notes:
      "Bandai OPTCG → `data/onepiece/`. Titres FR/EN via punk-records (vegapull) ; faces cardlist Bandai (`art.bandai.webp`) ; scellé opecards.fr. Pas de client Unity foil Bandai → face plate.",
  },
  runPipeline: async (argv) => {
    const { runOnepiecePackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runOnepiecePackPipeline(argv);
  },
});

export const onepieceLine = built.line;
export const onepieceCatalog = built.catalog;
export const onepieceModule = built.module;
