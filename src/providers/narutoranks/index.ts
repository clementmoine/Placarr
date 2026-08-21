/**
 * Naruto Ninja Ranks — Panini Premium Trading Cards.
 *
 * Autre jeu que le Carddass et le 疾風伝 : autre éditeur, autre maquette.
 * Les titres viennent de la checklist officielle Inkworks (2006). Les
 * Packshots officiels (sachet, display, album) sont des produits scellés.
 * Deux échantillons officiels (SD-1, BL-1) plus des dumps fan (sachet vert, SD-4).
 */
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";
import { createLocalTcgLine } from "@/providers/shared/cardCatalogue/localTcgLine";

import {
  NARUTO_RANKS_EFFECT_PACK_ID,
  NARUTO_RANKS_PACK_ID,
  NARUTO_RANKS_PROVIDER_ID,
} from "./pack";
import {
  formatNinjaRanksReference,
  ninjaRanksSetLabel,
  ninjaRanksSetSortKey,
} from "./printKey";

export {
  NARUTO_RANKS_EFFECT_PACK_ID,
  NARUTO_RANKS_PACK_ID,
  NARUTO_RANKS_PROVIDER_ID,
  narutoRanksCuratedDir,
} from "./pack";

const line = createLocalTcgLine({
  providerId: NARUTO_RANKS_PROVIDER_ID,
  providerLabel: "Naruto Ninja Ranks (local)",
  catalogueLabel: "Naruto Ninja Ranks",
  factLabel: "Ninja Ranks",
  packId: NARUTO_RANKS_PACK_ID,
  effectPackId: NARUTO_RANKS_EFFECT_PACK_ID,
  printGame: "naruto",
  defaultLanguage: "en",
  syncHint: "pnpm naruto:ranks",
  websiteUrl: "http://www.inkworks.com/products/naruto/ninjaranks/naruto.html",
  formatReference: formatNinjaRanksReference,
  setLabel: ninjaRanksSetLabel,
  setSortKey: ninjaRanksSetSortKey,
  notes:
    "Panini Ninja Ranks Premium Trading Cards → `data/naruto/ninja-ranks/`. Checklist officielle Inkworks (100 titres EN, juin 2006). Packshots officiels en produits scellés (booster, display, album). Faces échantillon Inkworks (SD-1, BL-1) et dumps fan (sachet vert, SD-4). Ni Carddass, ni CCG Bandai, ni 疾風伝, ni Ultra Challenge. Les NS européennes d'AnimeCollection ne sont pas sur la feuille US.",
});

export const narutoRanksLine = line;
export const narutoRanksDbPath = line.index.dbPath;

const hooks = cardCatalogueHooks({
  packId: NARUTO_RANKS_PACK_ID,
  dbPath: line.index.dbPath,
  runPipeline: async (argv) => {
    const { runNarutoRanksPackPipeline } = await import(
      /* webpackIgnore: true */
      "./cli"
    );
    return runNarutoRanksPackPipeline(argv);
  },
});

export const refreshNarutoRanksCatalog = hooks.refresh;
export const narutoRanksCatalogStatus = hooks.status;
export const narutoRanksCatalog = hooks;

export const narutoranksModule = line.attachCatalog(hooks);
