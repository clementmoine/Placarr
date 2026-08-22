/**
 * Naruto Ultra Challenge — Panini lamincards (2007).
 *
 * Autre jeu que le Carddass : Vintage rangeait ces faces sous « French » et
 * elles n'ont jamais été des NI/TE/TA. Ligne Catalogue à part : album et
 * pochette (upscales Figma + dump Coleka), et cent cartes titrées, sans face.
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
  factLabel: "Ultra Challenge",
  packId: NARUTO_ULTRA_PACK_ID,
  effectPackId: NARUTO_ULTRA_EFFECT_PACK_ID,
  printGame: "naruto",
  defaultLanguage: "fr",
  syncHint: "pnpm naruto:ultra",
  websiteUrl: "http://www.animecollection.fr/cartes.php?idl=4&idc=113&ids=254",
  notes:
    "Panini Ultra Challenge (lamincards, sept. 2007) → `data/naruto/ultra-challenge/`. Ni Carddass, ni CCG Bandai, ni 疾風伝, ni Ninja Ranks. Album et pochette (upscales Figma, dump Coleka à côté). Les cent cartes viennent de la checklist laststicker (collection 589) : le verso d’album en est une aussi, mais l’upscale en brouille les numéros. Aucune face : les scans laststicker ne font que 211×300, et sa galerie est interdite aux robots.",
});

export const narutoUltraLine = line;
export const narutoUltraDbPath = line.index.dbPath;

const hooks = cardCatalogueHooks({
  packId: NARUTO_ULTRA_PACK_ID,
  dbPath: line.index.dbPath,
  runPipeline: async (argv) => {
    const { runNarutoUltraPackPipeline } = await import(
      /* webpackIgnore: true */
      "./cli"
    );
    return runNarutoUltraPackPipeline(argv);
  },
});

export const refreshNarutoUltraCatalog = hooks.refresh;
export const narutoUltraCatalogStatus = hooks.status;
export const narutoUltraCatalog = hooks;

export const narutoultraModule = line.attachCatalog(hooks);
