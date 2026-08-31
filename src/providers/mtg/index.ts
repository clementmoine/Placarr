/**
 * Magic: The Gathering — ligne catalogue locale (vide jusqu'à la moisson).
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  MTG_EFFECT_PACK_ID,
  MTG_PACK_ID,
  MTG_PRINT_GAME,
  MTG_PROVIDER_ID,
} from "./pack";

export {
  MTG_EFFECT_PACK_ID,
  MTG_PACK_ID,
  MTG_PRINT_GAME,
  MTG_PROVIDER_ID,
  mtgCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: MTG_PROVIDER_ID,
    providerLabel: "Magic: The Gathering (local)",
    catalogueLabel: "Magic: The Gathering",
    factLabel: "Magic: The Gathering",
    packId: MTG_PACK_ID,
    effectPackId: MTG_EFFECT_PACK_ID,
    printGame: MTG_PRINT_GAME,
    defaultLanguage: "en",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://scryfall.com/",
    notes:
      "Magic: The Gathering → `data/mtg/`. Catalogue local vide (Scryfall à brancher). Catalogue-only ; foil Scryfall ≠ masks Unity.",
  },
  runPipeline: async (argv) => {
    const { runMtgPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runMtgPackPipeline(argv);
  },
});

export const mtgLine = built.line;
export const mtgCatalog = built.catalog;
export const mtgModule = built.module;
