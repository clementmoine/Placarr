/**
 * Naruto Kayou — cartes à collectionner (CN / modern), checklist narutocards.ca.
 *
 * Autre produit que Mythos (TCG jouable CICABOOM) et que le Carddass Bandai.
 */
import { createEmptyLocalTcgProvider } from "@/providers/shared/cardCatalogue/createEmptyLocalTcgProvider";
import { artOrientationForPackPrint } from "@/providers/shared/cardCatalogue/cardsIndexOrientation";
import type {
  FoilPlayroomNeed,
  PrintCandidate,
} from "@/types/providerModule";

import { kayouSetLabelFromLedger } from "./buildFromLedgers";
import { stampKayouFoil } from "./finishes";
import { stampKayouBack } from "./kayouBack";
import { kayouLenticularCropProfileForPrintKey, kayouLenticularGridForPrintKey, kayouScanCropForPrintKey } from "./lenticularGrid";
import {
  NARUTO_KAYOU_EFFECT_PACK_ID,
  NARUTO_KAYOU_PACK_ID,
  NARUTO_KAYOU_PRINT_GAME,
  NARUTO_KAYOU_PROVIDER_ID,
} from "./pack";
import { suggestKayouFoilPlayroomSamples } from "./playroomSamples";
import {
  formatKayouReference,
  kayouSetSortKey,
  normalizeKayouSearchQuery,
} from "./printKey";

export {
  NARUTO_KAYOU_EFFECT_PACK_ID,
  NARUTO_KAYOU_PACK_ID,
  NARUTO_KAYOU_PRINT_GAME,
  NARUTO_KAYOU_PROVIDER_ID,
  narutoKayouCuratedDir,
} from "./pack";

const built = createEmptyLocalTcgProvider({
  lineSpec: {
    providerId: NARUTO_KAYOU_PROVIDER_ID,
    providerLabel: "Naruto Kayou (local)",
    catalogueLabel: "Naruto Kayou",
    catalogueAliases: ["Kayou", "KAYOU Naruto"],
    factLabel: "Naruto Kayou",
    packId: NARUTO_KAYOU_PACK_ID,
    effectPackId: NARUTO_KAYOU_EFFECT_PACK_ID,
    printGame: NARUTO_KAYOU_PRINT_GAME,
    defaultLanguage: "en",
    syncHint: "Catalogue Sync (admin)",
    websiteUrl: "https://www.narutocards.ca/",
    formatReference: formatKayouReference,
    setLabel: kayouSetLabelFromLedger,
    setSortKey: kayouSetSortKey,
    normalizeSearchQuery: normalizeKayouSearchQuery,
    notes:
      "Kayou Naruto (cartes à collectionner) → `data/naruto/kayou/`. Checklist + faces CDN narutocards.ca (`narutocards-kayou-checklist.json`). Versos par rareté via kayouofficial.com (`back.<tier>.webp`). Autre éditeur que Bandai Carddass et CICABOOM Mythos.",
  },
  runPipeline: async (argv) => {
    const { runNarutoKayouPackPipeline } = await import(
      /* webpackIgnore: true */
      "./extract"
    );
    return runNarutoKayouPackPipeline(argv);
  },
});

function stampKayouPrint(candidate: PrintCandidate): PrintCandidate {
  const grid = kayouLenticularGridForPrintKey(candidate.printKey);
  const scanCrop = kayouScanCropForPrintKey(candidate.printKey);
  const lenticularCropProfile = kayouLenticularCropProfileForPrintKey(
    candidate.printKey,
  );
  const stamped = stampKayouBack(stampKayouFoil(candidate));
  const withGrid = grid ? { ...stamped, lenticularGrid: grid } : stamped;
  const withCrop = scanCrop ? { ...withGrid, scanCrop } : withGrid;
  const withLenticularCrop = lenticularCropProfile
    ? { ...withCrop, lenticularCropProfile }
    : withCrop;
  const orient = artOrientationForPackPrint(
    NARUTO_KAYOU_PACK_ID,
    candidate.printKey,
    candidate.language ?? "en",
  );
  if (orient?.landscapeFace) {
    return { ...withLenticularCrop, landscapeFace: true };
  }
  return withLenticularCrop;
}

function stampList(cards: PrintCandidate[]): PrintCandidate[] {
  return cards.map(stampKayouPrint);
}

export const narutoKayouLine = built.line;
export const narutoKayouCatalog = built.catalog;
export const narutokayouModule = {
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
    ...args: Parameters<
      NonNullable<typeof built.module.refreshBarcodePriceOffers>
    >
  ) => {
    const { refreshKayouGgPriceOffers } = await import("./ggPriceOffers");
    return refreshKayouGgPriceOffers(...args);
  },
  searchPrints: async (
    ...args: Parameters<NonNullable<typeof built.module.searchPrints>>
  ) => stampList(await built.module.searchPrints!(...args)),
  lookupPrint: async (
    ...args: Parameters<NonNullable<typeof built.module.lookupPrint>>
  ) => {
    const card = await built.module.lookupPrint!(...args);
    return card ? stampKayouPrint(card) : null;
  },
  listSetPrints: built.module.listSetPrints
    ? async (
        ...args: Parameters<NonNullable<typeof built.module.listSetPrints>>
      ) => stampList(await built.module.listSetPrints!(...args))
    : undefined,
  suggestFoilPlayroomSamples: async (needs: readonly FoilPlayroomNeed[]) =>
    suggestKayouFoilPlayroomSamples(needs),
};
