/**
 * Naruto Ultra Challenge — Panini lamincards (2007).
 *
 * Autre jeu que le Carddass : Vintage rangeait ces faces sous « French » et
 * elles n'ont jamais été des NI/TE/TA. Ligne Catalogue à part : album et
 * pochette (upscales Figma + dump Coleka), titres laststicker, faces
 * AnimeCollection (h400).
 */
import { cardCatalogueHooks } from "@/providers/shared/cardCatalogue/pipeline";
import { createLocalTcgLine } from "@/providers/shared/cardCatalogue/localTcgLine";

import {
  NARUTO_ULTRA_EFFECT_PACK_ID,
  NARUTO_ULTRA_PACK_ID,
  NARUTO_ULTRA_PROVIDER_ID,
} from "./pack";

export {
  NARUTO_ULTRA_EFFECT_PACK_ID,
  NARUTO_ULTRA_PACK_ID,
  NARUTO_ULTRA_PROVIDER_ID,
  narutoUltraCuratedDir,
} from "./pack";

const line = createLocalTcgLine({
  providerId: NARUTO_ULTRA_PROVIDER_ID,
  providerLabel: "Naruto Ultra Challenge (local)",
  catalogueLabel: "Naruto Ultra Challenge",
  catalogueAliases: ["Ultra Challenge", "Naruto Ultra Challenge"],
  factLabel: "Ultra Challenge",
  packId: NARUTO_ULTRA_PACK_ID,
  effectPackId: NARUTO_ULTRA_EFFECT_PACK_ID,
  printGame: "naruto",
  defaultLanguage: "fr",
  syncHint: "Catalogue Sync (admin)",
  websiteUrl: "http://www.animecollection.fr/cartes.php?idl=4&idc=113&ids=254",
  notes:
    "Panini Ultra Challenge (lamincards, sept. 2007) → `data/naruto/ultra-challenge/`. Ni Carddass, ni CCG Bandai, ni 疾風伝, ni Ninja Ranks. Album et pochette (upscales Figma, dump Coleka à côté). Titres : checklist laststicker (collection 589). Faces : Coleka (~995×1393, listing EN + FlareSolverr) → `art.coleka.webp` ; secours AnimeCollection h400.",
});

export const narutoUltraLine = line;
export const narutoUltraDbPath = line.index.dbPath;

const hooks = cardCatalogueHooks({
  packId: NARUTO_ULTRA_PACK_ID,
  dbPath: line.index.dbPath,
  runPipeline: async (argv) => {
    const { runNarutoUltraPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runNarutoUltraPackPipeline(argv);
  },
});

export const refreshNarutoUltraCatalog = hooks.refresh;
export const narutoUltraCatalogStatus = hooks.status;
export const narutoUltraCatalog = hooks;

export const narutoultraModule = line.attachCatalog(hooks);
