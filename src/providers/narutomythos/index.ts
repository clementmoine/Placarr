/**
 * Naruto Mythos TCG — CICABOOM (2025–), checklist Konoha Shidō Ch.1 (LorenZone).
 *
 * Autre jeu que le Carddass / Ninja Ranks / Ultra Challenge / Kayou.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";

import {
  NARUTO_MYTHOS_EFFECT_PACK_ID,
  NARUTO_MYTHOS_PACK_ID,
  NARUTO_MYTHOS_PRINT_GAME,
  NARUTO_MYTHOS_PROVIDER_ID,
} from "./pack";
import {
  formatMythosReference,
  mythosSetLabel,
  mythosSetSortKey,
  normalizeMythosSearchQuery,
} from "./printKey";

export {
  NARUTO_MYTHOS_EFFECT_PACK_ID,
  NARUTO_MYTHOS_PACK_ID,
  NARUTO_MYTHOS_PRINT_GAME,
  NARUTO_MYTHOS_PROVIDER_ID,
  narutoMythosCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: NARUTO_MYTHOS_PROVIDER_ID,
    providerLabel: "Naruto Mythos (local)",
    catalogueLabel: "Naruto Mythos",
    catalogueAliases: ["Mythos", "Naruto Mythos TCG"],
    factLabel: "Naruto Mythos",
    packId: NARUTO_MYTHOS_PACK_ID,
    effectPackId: NARUTO_MYTHOS_EFFECT_PACK_ID,
    printGame: NARUTO_MYTHOS_PRINT_GAME,
    defaultLanguage: "fr",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://www.narutotcgmythos.com/",
    formatReference: formatMythosReference,
    setLabel: mythosSetLabel,
    setSortKey: mythosSetSortKey,
    normalizeSearchQuery: normalizeMythosSearchQuery,
    notes:
      "CICABOOM Naruto Mythos TCG → `data/naruto/mythos/`. Faces `art.official` (gallery API cards.narutotcgmythos.com, 636 cartes). LorenZone en secours. Autre jeu que Carddass, Ninja Ranks, Ultra Challenge et Kayou.",
  },
  runPipeline: async (argv) => {
    const { runNarutoMythosPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runNarutoMythosPackPipeline(argv);
  },
});

export const narutoMythosLine = built.line;
export const narutoMythosCatalog = built.catalog;
export const narutomythosModule = {
  ...built.module,
  info: {
    ...built.module.info,
    capabilities: [
      ...new Set([...(built.module.info.capabilities ?? []), "price" as const]),
    ],
    referencePriceSource: true,
    evidenceOnlyPriceRefresh: true,
    sourceAliases: ["narutocardgame.gg"],
    notes: `${built.module.info.notes ?? ""} Prix : côtes narutocardgame.gg (staging).`.trim(),
  },
  refreshBarcodePriceOffers: async (
    ctx: import("@/types/providerModule").BarcodePriceRefreshContext,
  ) => {
    const { refreshMythosGgPriceOffers } = await import("./ggPriceOffers");
    return refreshMythosGgPriceOffers(ctx);
  },
};
