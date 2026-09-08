/**
 * Dragon Ball Lamincards (Edibas) — cartes PVC transparentes, autre produit
 * que Masters / Fusion World. Plusieurs séries (1ʳᵉ, Platino, GT Smeraldo, FR…) ;
 * le catalogue local démarre vide.
 *
 * « Lamincards » est le nom de marque inventé chez Edibas (Turin), pas un
 * surnom fan — attesté paninimania / dragonball.center / hunt Wayback.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  DBS_LAMINCARDS_EFFECT_PACK_ID,
  DBS_LAMINCARDS_PACK_ID,
  DBS_LAMINCARDS_PRINT_GAME,
  DBS_LAMINCARDS_PROVIDER_ID,
} from "./pack";

export {
  DBS_LAMINCARDS_EFFECT_PACK_ID,
  DBS_LAMINCARDS_PACK_ID,
  DBS_LAMINCARDS_PRINT_GAME,
  DBS_LAMINCARDS_PROVIDER_ID,
  dbsLamincardsCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: DBS_LAMINCARDS_PROVIDER_ID,
    providerLabel: "Dragon Ball Lamincards (local)",
    catalogueLabel: "Dragon Ball Lamincards",
    catalogueAliases: [
      { label: "Lamincards", language: "fr" },
      { label: "Edibas Lamincards", language: "it" },
      { label: "Dragon Ball Z Lamincards", language: "en" },
    ],
    factLabel: "Lamincards",
    packId: DBS_LAMINCARDS_PACK_ID,
    effectPackId: DBS_LAMINCARDS_EFFECT_PACK_ID,
    printGame: DBS_LAMINCARDS_PRINT_GAME,
    defaultLanguage: "fr",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://web.archive.org/web/20070403094745id_/http://www.edibas.com/edibas_it/collezionabili_lista.aspx",
    notes:
      "Edibas Lamincards (PVC) → `data/dbs/lamincards/`. Faces : Dragon Ball Center (`art.dbc.jpg`, séries Nero/Argento/Oro/Platino/Smeraldo/z2008). Coleka r4591 documenté mais mur Verifica. Distinct de Bandai Masters / Fusion World.",
  },
  runPipeline: async (argv) => {
    const { runDbsLamincardsPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runDbsLamincardsPackPipeline(argv);
  },
});

export const dbsLamincardsLine = built.line;
export const dbsLamincardsCatalog = built.catalog;
export const dbslamincardsModule = built.module;
