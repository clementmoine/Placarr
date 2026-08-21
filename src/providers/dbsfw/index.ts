import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { listDbsFwPrintSets } from "./indexStore";
/**
 * Dragon Ball Super Card Game Fusion World — Bandai fw/en cardlist, local index.
 * Provider id `dbsfw`; printKey game slug `dbsfw`. Masters is `dbscg`.
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
  ProviderModule,
} from "@/types/providerModule";

import { dbsFwPrintFacts } from "./facts";
import { dbsFwDbPath, ensureDbsFwIndex } from "./indexStore";
import { dbsfwCatalog } from "./pipeline";
import { DBS_FW_GAME } from "./printIdentity";
import {
  lookupDbsFwPrint,
  lookupDbsFwPrintDetail,
  searchDbsFwPrints,
} from "./searchPrints";

const PROVIDER_ID = "dbsfw";
const PROVIDER_LABEL = "Dragon Ball Super Card Game Fusion World";

const PROBE_PRINT_KEY = "dbsfw:st01-001";
const PROBE_CARD_NAME = "Son Goten";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (parsePrintKey(printKey)?.game !== DBS_FW_GAME) return null;
  if (!ensureDbsFwIndex()) return null;
  const row = lookupDbsFwPrintDetail(printKey);
  if (!row) return null;
  const title = row.fullName?.trim();
  if (!title) return null;

  return {
    title,
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    facts: dbsFwPrintFacts(row, PROVIDER_ID),
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const dbsfwModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Dragon Ball Fusion World",
    factLabel: "DBS FW",
    types: ["tcg"],
    capabilities: ["identify", "cover"],
    nameDatabase: true,
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    defaultLanguage: "en",
    websiteUrl: "https://www.dbs-cardgame.com/fw/en/cardlist/",
    notes:
      "Fusion World (fw/en cardlist, pas de locale FR) → `data/dbs/fw/`. Faces Bandai (SAMPLE). Dos sleeve placeholder Masters. Sync : `pnpm dbs:fw`.",
  },
  catalog: dbsfwCatalog,
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.9,
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const cards = searchDbsFwPrints(cleanedName, { limit: 10 });
    return Array.from(new Set(cards.map((card) => card.title)));
  },
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  /* Les extensions viennent du catalogue local, comme les cartes elles-mêmes. */
  /*
    Lues dans la base, pas écrites ici : Fusion World n'est sorti qu'en anglais
    et en japonais, et le filtre de langue doit pouvoir le retirer de « FR »
    sans qu'on ait à le lui dire — ni à corriger une liste en dur le jour où
    Bandai localise le jeu.
  */
  listPrintLanguages: () => distinctPrintLanguages(dbsFwDbPath()),
  listPrintSets: () => listDbsFwPrintSets(),
  searchPrints: async ({ query, language, limit, setId }) =>
    searchDbsFwPrints(query, { language: language ?? undefined, limit, setId }),
  lookupPrint: async ({ printKey, language }) => {
    if (parsePrintKey(printKey)?.game !== DBS_FW_GAME) return null;
    return lookupDbsFwPrint(printKey, { language: language ?? undefined });
  },
  runMappingProbe: async () =>
    metadataProbe(lookupDbsFwPrintDetail(PROBE_PRINT_KEY)),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: PROBE_CARD_NAME,
      printKey: PROBE_PRINT_KEY,
    });
    return mappingRawKeysFromFetch(async () =>
      lookupDbsFwPrintDetail(ctx.printKey ?? PROBE_PRINT_KEY),
    );
  },
  testHandlers: {
    "dbsfw-search": {
      label: "DBS FW - Recherche",
      kind: "metadata",
      run: (query) => Promise.resolve(searchDbsFwPrints(query, { limit: 10 })),
    },
    "dbsfw-printkey": {
      label: "DBS FW - Clé de tirage",
      kind: "metadata",
      run: (query) => Promise.resolve(lookupDbsFwPrint(query)),
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
      const dbPath = dbsFwDbPath();
      const ok = existsSync(dbPath) && Boolean(ensureDbsFwIndex());
      return {
        ok,
        latency: Date.now() - start,
        error: ok ? null : `Index unavailable — run pnpm dbs:fw (${dbPath})`,
        configured: true,
      };
    },
  ),
};

export { dbsFwDbPath, ensureDbsFwIndex, writeDbsFwIndex } from "./indexStore";
