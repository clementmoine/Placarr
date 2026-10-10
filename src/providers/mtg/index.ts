/**
 * Magic: The Gathering — catalogue local Scryfall.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import { decorateMtgCandidate } from "./finishes";
import {
  MTG_EFFECT_PACK_ID,
  MTG_PACK_ID,
  MTG_PRINT_GAME,
  MTG_PROVIDER_ID,
} from "./pack";
import { formatMtgReference } from "./printKey";

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
    providerLabel: "Magic: The Gathering (Scryfall)",
    catalogueLabel: "Magic: The Gathering",
    factLabel: "Magic: The Gathering",
    packId: MTG_PACK_ID,
    effectPackId: MTG_EFFECT_PACK_ID,
    printGame: MTG_PRINT_GAME,
    defaultLanguage: "fr",
    catalogLifecycle: "living",
    syncHint: "Catalogue Sync (admin) — Scryfall all_cards",
    websiteUrl: "https://scryfall.com/",
    notes:
      "Magic: The Gathering → `data/mtg/`. Moisson Scryfall `all_cards` — titres/faces **en** (original) + **fr**, plus exclusives hors EN/FR. Finishes sur le candidat, pas dans la printKey. Catalogue-only.",
    formatReference: formatMtgReference,
    borrowFaceAcrossLocales: true,
    decorateCandidate: (base) => decorateMtgCandidate(base),
    listRemotePrintSets: async () => {
      const { listScryfallRemoteSets } = await import(
        /* webpackIgnore: true */
        "./harvest/listScryfallSets"
      );
      return listScryfallRemoteSets();
    },
  },
  autoSkip: ["products"],
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
