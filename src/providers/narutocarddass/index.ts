/**
 * Naruto CCG (Bandai) — local closed catalogue under `data/naruto/carddass/`.
 * Provider id `narutocarddass`; printKey game slug stays `naruto`.
 */
import { existsSync } from "node:fs";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { parsePrintKey } from "@/core/identify/printKey";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";
import narutoBoosterComposition from "./curated/booster-composition.json";
import type { BoosterCompositionFile } from "@/providers/shared/sealedProducts/boosterComposition";

import {
  ensureNarutoCcgIndex,
  lookupNarutoTitle,
  narutoCcgDbPath,
} from "./indexStore";
import {
  listNarutoPrintSets,
  listNarutoSetPrints,
  lookupNarutoPrint,
  lookupNarutoPrintDetail,
  searchNarutoPrints,
} from "./searchPrints";
import { narutoPrintFacts } from "./facts";
import {
  narutoAssetsCardUrl,
  narutoCardPathFromCollector,
} from "./narutoCardPath";
import { NARUTO_PACK_ID } from "./packs";
import { narutocarddassCatalog } from "./pipeline";
import {
  NARUTO_INDICATIVE_PRICE_SOURCE,
  refreshNarutoIndicativePriceOffers,
} from "./sources/collectionNarutoPriceOffers";
import {
  classicGgNumberToPrintKey,
  GG_ARCHIVE_PRICE_SOURCE,
  refreshGgArchivePriceOffers,
} from "@/providers/shared/naruto/ggArchivePrices";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import type { PriceOfferInput } from "@/core/enrich/evidence";

/** Dig FR d'abord ; à défaut côtes classic-ccg gg (USD). */
export async function refreshNarutoCarddassPriceOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<PriceOfferInput[]> {
  const indicative = await refreshNarutoIndicativePriceOffers(ctx);
  if (indicative.length) return indicative;
  return refreshGgArchivePriceOffers({
    ctx,
    packId: NARUTO_PACK_ID,
    printGame: "naruto",
    resolvePrintKey: (row) => classicGgNumberToPrintKey(row.number ?? ""),
  });
}

const PROVIDER_ID = "narutocarddass";
const PROVIDER_LABEL = "Naruto CCG (local)";

/** Probe sample: the first card of the first series, always on disk. */
const PROBE_PRINT_KEY = "naruto:s1-ni001";
const PROBE_CARD_NAME = "Naruto Uzumaki";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (!ensureNarutoCcgIndex()) return null;
  const row = lookupNarutoPrintDetail(printKey);
  if (!row) return null;
  const title =
    row.fullName?.trim() ||
    lookupNarutoTitle(printKey, "fr")?.fullName ||
    lookupNarutoTitle(printKey, "en")?.fullName;
  if (!title) return null;

  const pathId = narutoCardPathFromCollector(row.number, row.lang);
  const face =
    row.art && pathId
      ? narutoAssetsCardUrl(NARUTO_PACK_ID, pathId, row.art)
      : undefined;

  return {
    title,
    ...(face ? { imageUrl: face } : {}),
    facts: narutoPrintFacts(row, PROVIDER_ID),
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const narutocarddassModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Naruto Carddass",
    catalogueAliases: [
      "Naruto CCG",
      "Naruto JCC",
      "JCC Naruto",
      "CCG Naruto",
      "Naruto Cartes à Jouer",
      {
        label: "Shippuden Collectible Card Game",
        language: "en",
      },
      {
        label: "Naruto Shippuden Collectible Card Game",
        language: "en",
      },
    ],
    types: ["tcg"],
    capabilities: ["identify", "cover", "price"],
    /** Closed local corpus: its own names are the reference for manual entry. */
    nameDatabase: true,
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://www.carddass.com/",
    /** Côtes dig Collection Naruto — référence quand le marché live est absent. */
    referencePriceSource: true,
    evidenceOnlyPriceRefresh: true,
    sourceAliases: [NARUTO_INDICATIVE_PRICE_SOURCE, GG_ARCHIVE_PRICE_SOURCE],
    factLabel: NARUTO_INDICATIVE_PRICE_SOURCE,
    notes:
      "Corpus Bandai CCG/JCC (FR first-class) → `data/naruto/carddass/`. Curated sous `src/providers/narutocarddass/curated/`. Sync : Catalogue Extract (admin / worker). Prix : Estimations Collection Naruto (YT 7r7) + côtes narutocardgame.gg classic-ccg.",
  },
  catalog: narutocarddassCatalog,
  evidence: {
    label: PROVIDER_LABEL,
    // Its own catalogue, read from disk — no scrape guesswork to discount.
    sourceWeight: 0.9,
  },
  refreshBarcodePriceOffers: refreshNarutoCarddassPriceOffers,
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const cards = searchNarutoPrints(cleanedName, { limit: 10 });
    // Several prints share a name (`ni023` retail + promo): the picker is what
    // tells them apart, so suggest each distinct title once.
    return Array.from(new Set(cards.map((card) => card.title)));
  },
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  searchPrints: async ({ query, language, limit, setId }) =>
    searchNarutoPrints(query, {
      language: language ?? undefined,
      limit,
      setId,
    }),
  /*
    Les quatre langues du jeu, telles que le catalogue les porte. Annoncées
    d'avance : le japonais change la découpe, donc il faut pouvoir le choisir
    avant de chercher.
  */
  listPrintLanguages: () => ["fr", "en", "ja", "it"],
  /*
    La langue choisit la **découpe**, pas seulement les libellés : le japonais
    compte en 巻ノ (dix-sept volumes 2002-2006), l'Europe en séries `s1`…`s28`,
    et les deux ne se superposent pas — le 巻ノ十 recoupe les séries 4 et 5.
  */
  printGames: ["naruto"],
  loadBoosterComposition: () => {
    const raw = narutoBoosterComposition as BoosterCompositionFile;
    return raw?.version === 1 ? raw : null;
  },
  listPrintSets: (_type, language) => listNarutoPrintSets(language),
  listSetPrints: ({ setId, language }) =>
    listNarutoSetPrints({ setId, language }),
  lookupPrint: async ({ printKey, language }) => {
    if (parsePrintKey(printKey)?.game !== "naruto") return null;
    return lookupNarutoPrint(printKey, { language: language ?? undefined });
  },
  runMappingProbe: async () =>
    metadataProbe(lookupNarutoPrintDetail(PROBE_PRINT_KEY)),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: PROBE_CARD_NAME,
      printKey: PROBE_PRINT_KEY,
    });
    return mappingRawKeysFromFetch(async () =>
      lookupNarutoPrintDetail(ctx.printKey ?? PROBE_PRINT_KEY),
    );
  },
  testHandlers: {
    "narutocarddass-search": {
      label: "Naruto CCG - Recherche",
      kind: "metadata",
      run: (query) => Promise.resolve(searchNarutoPrints(query, { limit: 10 })),
    },
    "narutocarddass-printkey": {
      label: "Naruto CCG - Clé de tirage",
      kind: "metadata",
      run: (query) => Promise.resolve(lookupNarutoPrint(query)),
    },
  },
  mappingProbe: {
    sampleInput: PROBE_PRINT_KEY,
    context: { printKey: PROBE_PRINT_KEY },
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const dbPath = narutoCcgDbPath();
      const ok = existsSync(dbPath) && Boolean(ensureNarutoCcgIndex());
      return {
        ok,
        latency: Date.now() - start,
        error: ok
          ? null
          : `Index unavailable — run Catalogue Sync for Naruto Carddass (${dbPath})`,
        configured: true,
      };
    },
  ),
});

export {
  writeNarutoCcgIndex,
  exportNarutoCardsIndexJson,
  narutoCcgDbPath,
  ensureNarutoCcgIndex,
} from "./indexStore";
