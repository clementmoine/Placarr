import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { listDbsCgPrintSets } from "./indexStore";
/**
 * Dragon Ball Super Card Game (Masters) — Bandai FR+EN cardlists, local index.
 * Provider id `dbscg`; printKey game slug `dbscg`. Fusion World is `dbsfw`.
 */
import { existsSync } from "node:fs";

import { catalogAliasesFromNames } from "@/core/enrich/aliases";
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
  ProviderModule,
} from "@/types/providerModule";

import { dbsCgPrintFacts } from "./facts";
import { dbsCgDbPath, ensureDbsCgIndex } from "./indexStore";
import { dbscgCatalog } from "./pipeline";
import { DBS_CG_GAME } from "./printIdentity";
import {
  lookupDbsCgPrint,
  lookupDbsCgPrintDetail,
  searchDbsCgPrints,
} from "./searchPrints";

const PROVIDER_ID = "dbscg";
const PROVIDER_LABEL = "Dragon Ball Super Card Game";

const PROBE_PRINT_KEY = "dbscg:bt1-001";
const PROBE_CARD_NAME = "Champa";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (parsePrintKey(printKey)?.game !== DBS_CG_GAME) return null;
  if (!ensureDbsCgIndex()) return null;
  const row = lookupDbsCgPrintDetail(printKey);
  if (!row) return null;
  const title = row.fullName?.trim();
  if (!title) return null;

  const otherLang = row.lang.toLowerCase() === "en" ? "fr" : "en";
  const other = lookupDbsCgPrintDetail(printKey, { language: otherLang });
  const aliases = catalogAliasesFromNames(title, [
    row.awakenedName,
    row.character,
    other?.fullName,
    other?.awakenedName,
    other?.character,
  ]);

  return {
    title,
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    ...(aliases?.length ? { aliases } : {}),
    facts: dbsCgPrintFacts(row, PROVIDER_ID),
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const dbscgModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Dragon Ball Masters",
    factLabel: "DBS CG",
    types: ["tcg"],
    capabilities: ["identify", "cover"],
    nameDatabase: true,
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://www.dbs-cardgame.com/europe-fr/cartes/",
    notes:
      "Masters (cardlists Bandai europe-fr + us-en) → `data/dbs/cg/`. Noms FR et EN dans l’index. Faces Deckplanet EN / dbscards FR au sync, SAMPLE Bandai en fallback. Dos sleeve dbscards. Sync : `pnpm dbs:cards`. Fusion World = module `dbsfw`.",
  },
  catalog: dbscgCatalog,
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.9,
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const cards = searchDbsCgPrints(cleanedName, { limit: 10 });
    return Array.from(new Set(cards.map((card) => card.title)));
  },
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  /* Les extensions viennent du catalogue local, comme les cartes elles-mêmes. */
  /** Lues dans la base : voir `distinctPrintLanguages`. */
  listPrintLanguages: () => distinctPrintLanguages(dbsCgDbPath()),
  listPrintSets: () => listDbsCgPrintSets(),
  searchPrints: async ({ query, language, limit, setId }) =>
    searchDbsCgPrints(query, { language: language ?? undefined, limit, setId }),
  lookupPrint: async ({ printKey, language }) => {
    if (parsePrintKey(printKey)?.game !== DBS_CG_GAME) return null;
    return lookupDbsCgPrint(printKey, { language: language ?? undefined });
  },
  runMappingProbe: async () =>
    metadataProbe(lookupDbsCgPrintDetail(PROBE_PRINT_KEY)),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: PROBE_CARD_NAME,
      printKey: PROBE_PRINT_KEY,
    });
    return mappingRawKeysFromFetch(async () =>
      lookupDbsCgPrintDetail(ctx.printKey ?? PROBE_PRINT_KEY),
    );
  },
  testHandlers: {
    "dbscg-search": {
      label: "DBS CG - Recherche",
      kind: "metadata",
      run: (query) => Promise.resolve(searchDbsCgPrints(query, { limit: 10 })),
    },
    "dbscg-printkey": {
      label: "DBS CG - Clé de tirage",
      kind: "metadata",
      run: (query) => Promise.resolve(lookupDbsCgPrint(query)),
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
      const dbPath = dbsCgDbPath();
      const ok = existsSync(dbPath) && Boolean(ensureDbsCgIndex());
      return {
        ok,
        latency: Date.now() - start,
        error: ok ? null : `Index unavailable — run pnpm dbs:cards (${dbPath})`,
        configured: true,
      };
    },
  ),
};

export { dbsCgDbPath, ensureDbsCgIndex, writeDbsCgIndex } from "./indexStore";
