/**
 * Naruto CCG (Bandai) — local closed catalogue under `data/naruto/ccg/`.
 * Provider id `narutoccg`; printKey game slug stays `naruto`.
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

import {
  ensureNarutoCcgIndex,
  lookupNarutoTitle,
  narutoCcgDbPath,
} from "./indexStore";
import {
  searchNarutoPrints,
  lookupNarutoPrint,
  lookupNarutoPrintDetail,
} from "./searchPrints";
import { narutoPrintFacts } from "./facts";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { NARUTO_PACK_ID } from "./indexStore";
import { narutoccgCatalog } from "./pipeline";

const PROVIDER_ID = "narutoccg";
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

  const face = row.art
    ? assetsCardUrl(
        NARUTO_PACK_ID,
        { set: row.setCode, lang: row.lang, card: row.number },
        row.art,
      )
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

export const narutoccgModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    capabilities: ["identify", "cover"],
    /** Closed local corpus: its own names are the reference for manual entry. */
    nameDatabase: true,
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://www.carddass.com/",
    notes:
      "Corpus Bandai CCG/JCC (FR first-class) → `data/naruto/ccg/`. Curated sous `src/providers/narutoccg/curated/`. Sync : `pnpm naruto:cards`.",
  },
  catalog: narutoccgCatalog,
  evidence: {
    label: PROVIDER_LABEL,
    // Its own catalogue, read from disk — no scrape guesswork to discount.
    sourceWeight: 0.9,
  },
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
  searchPrints: async ({ query, language, limit }) =>
    searchNarutoPrints(query, { language: language ?? undefined, limit }),
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
    "narutoccg-search": {
      label: "Naruto CCG - Recherche",
      kind: "metadata",
      run: (query) => Promise.resolve(searchNarutoPrints(query, { limit: 10 })),
    },
    "narutoccg-printkey": {
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
