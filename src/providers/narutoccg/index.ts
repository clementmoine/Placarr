/**
 * Naruto CCG (Bandai) — local closed catalogue under `data/naruto/ccg/`.
 * Provider id `narutoccg`; printKey game slug stays `naruto`.
 */
import { existsSync } from "node:fs";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { parsePrintKey } from "@/core/identify/printKey";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
  ProviderModule,
} from "@/types/providerModule";

import {
  ensureNarutoCcgIndex,
  lookupNarutoTitle,
  narutoCcgDbPath,
} from "./indexStore";
import { searchNarutoPrints, lookupNarutoPrint } from "./searchPrints";
import { narutoccgCatalog } from "./pipeline";

const PROVIDER_ID = "narutoccg";
const PROVIDER_LABEL = "Naruto CCG (local)";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (!ensureNarutoCcgIndex()) return null;
  const title =
    lookupNarutoTitle(printKey, "fr") ?? lookupNarutoTitle(printKey, "en");
  if (!title) return null;
  return {
    title: title.fullName,
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
    },
  };
}

export const narutoccgModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    capabilities: ["identify", "cover"],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://www.carddass.com/",
    notes:
      "Corpus Bandai CCG/JCC (FR first-class) → `data/naruto/ccg/`. Curated sous `src/providers/narutoccg/curated/`. Sync : `pnpm naruto:cards`.",
  },
  catalog: narutoccgCatalog,
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  searchPrints: async ({ query, language, limit }) =>
    searchNarutoPrints(query, { language: language ?? undefined, limit }),
  lookupPrint: async ({ printKey, language }) => {
    if (parsePrintKey(printKey)?.game !== "naruto") return null;
    return lookupNarutoPrint(printKey, { language: language ?? undefined });
  },
  mappingProbe: {
    sampleInput: "naruto:s1-ni001",
    context: { printKey: "naruto:s1-ni001" },
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
          : `Index unavailable — run pnpm naruto:cards (${dbPath})`,
        configured: true,
      };
    },
  ),
};

export { runNarutoPackPipeline, selectSteps } from "./cli";
export {
  writeNarutoCcgIndex,
  exportNarutoCardsIndexJson,
  narutoCcgDbPath,
  ensureNarutoCcgIndex,
} from "./indexStore";
