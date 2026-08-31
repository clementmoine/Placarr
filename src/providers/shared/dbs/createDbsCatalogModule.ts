/**
 * Boilerplate ProviderModule commun aux catalogues DBS locaux (Masters /
 * Fusion World).
 *
 * Les schémas SQLite restent distincts (Masters a plus de colonnes titre ;
 * FW range la rareté dans `facts.json`) — on ne force pas `LocalPrintsIndex`.
 * Ce qui est identique : info, health, search/lookup wiring, metadata adapter,
 * probes.
 */
import { existsSync } from "node:fs";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { parsePrintKey } from "@/core/identify/printKey";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
  PrintCandidate,
  ProviderCatalogHooks,
  ProviderModule,
} from "@/types/providerModule";

export type DbsCatalogModuleSpec = {
  providerId: string;
  providerLabel: string;
  catalogueLabel: string;
  factLabel: string;
  printGame: string;
  defaultLanguage: "fr" | "en" | "unknown";
  websiteUrl: string;
  notes: string;
  /** Suffixe du message health si la base manque (Catalogue Sync). */
  syncHint: string;
  probePrintKey: string;
  probeCardName: string;
  catalog: ProviderCatalogHooks;
  dbPath: () => string;
  ensureIndex: () => unknown;
  listPrintSets: () => { id: string; label: string }[];
  searchPrints: (
    query: string,
    opts?: { language?: string; limit?: number; setId?: string | null },
  ) => PrintCandidate[];
  lookupPrint: (
    printKey: string,
    opts?: { language?: string },
  ) => PrintCandidate | null;
  lookupDetail: (printKey: string, opts?: { language?: string }) => unknown;
  resolveMetadata: (ctx: MetadataAdapterContext) => MetadataResult | null;
  loadBoosterComposition?: ProviderModule["loadBoosterComposition"];
};

export function createDbsCatalogModule(
  spec: DbsCatalogModuleSpec,
): ProviderModule {
  const {
    providerId,
    providerLabel,
    catalogueLabel,
    factLabel,
    printGame,
    defaultLanguage,
    websiteUrl,
    notes,
    syncHint,
    probePrintKey,
    probeCardName,
    catalog,
    dbPath,
    ensureIndex,
    listPrintSets,
    searchPrints,
    lookupPrint,
    lookupDetail,
    resolveMetadata,
    loadBoosterComposition,
  } = spec;

  return {
    info: {
      id: providerId,
      label: providerLabel,
      catalogueLabel,
      factLabel,
      types: ["tcg"],
      capabilities: ["identify", "cover"],
      nameDatabase: true,
      auth: { kind: "none" },
      supplyMode: "local_catalog",
      canonical: false,
      defaultLanguage,
      websiteUrl,
      notes,
    },
    catalog,
    evidence: {
      label: providerLabel,
      sourceWeight: 0.9,
    },
    suggestDatabaseTitles: async ({ cleanedName }) => {
      const cards = searchPrints(cleanedName, { limit: 10 });
      return Array.from(new Set(cards.map((card) => card.title)));
    },
    createMetadataAdapter: () => ({
      id: providerId,
      async resolve(ctx) {
        return resolveMetadata(ctx);
      },
    }),
    listPrintLanguages: () => distinctPrintLanguages(dbPath()),
    listPrintSets,
    printGames: [printGame],
    ...(loadBoosterComposition ? { loadBoosterComposition } : {}),
    listSetPrints: ({ setId, language }) =>
      enumerateSetPrints({
        setId,
        language,
        search: (opts) => searchPrints(opts.query, opts),
      }),
    searchPrints: async ({ query, language, limit, setId }) =>
      searchPrints(query, {
        language: language ?? undefined,
        limit,
        setId,
      }),
    lookupPrint: async ({ printKey, language }) => {
      if (parsePrintKey(printKey)?.game !== printGame) return null;
      return lookupPrint(printKey, { language: language ?? undefined });
    },
    runMappingProbe: async () => metadataProbe(lookupDetail(probePrintKey)),
    collectMappingRawKeys: async (context) => {
      const ctx = probeContextOrDefault(context, {
        name: probeCardName,
        printKey: probePrintKey,
      });
      return mappingRawKeysFromFetch(async () =>
        lookupDetail(ctx.printKey ?? probePrintKey),
      );
    },
    testHandlers: {
      [`${providerId}-search`]: {
        label: `${factLabel} - Recherche`,
        kind: "metadata",
        run: (query) => Promise.resolve(searchPrints(query, { limit: 10 })),
      },
      [`${providerId}-printkey`]: {
        label: `${factLabel} - Clé de tirage`,
        kind: "metadata",
        run: (query) => Promise.resolve(lookupPrint(query)),
      },
    },
    mappingProbe: {
      sampleInput: probePrintKey,
      context: { printKey: probePrintKey },
    },
    healthCheck: createMetadataHealthCheck(
      providerId,
      providerLabel,
      async () => {
        const start = Date.now();
        const path = dbPath();
        const ok = existsSync(path) && Boolean(ensureIndex());
        return {
          ok,
          latency: Date.now() - start,
          error: ok ? null : `Index unavailable — run ${syncHint} (${path})`,
          configured: true,
        };
      },
    ),
  };
}
