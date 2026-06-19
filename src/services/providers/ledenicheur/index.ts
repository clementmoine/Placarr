import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import { rawProbe } from "@/lib/mappingProbeUtils";
import {
  createTeardownBarcodeTask,
  dedupeTeardownQueries,
} from "@/lib/teardownUtils";

import {
  createMetadataHealthCheck,
} from "@/lib/providerHealthUtils";
import { fetchPricesFromLeDenicheur, pingLeDenicheur } from "./fetch";

export { fetchPricesFromLeDenicheur, pingLeDenicheur };

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];

export const ledenicheurModule: ProviderModule = {
  info: {
    id: "ledenicheur",
    label: "LeDénicheur",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["price", "identify", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  evidence: {
    label: "LeDenicheur",
    sourceWeight: 0.14,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { leDenicheur: deps.fetchPricesFromLeDenicheur(barcode) };
  },
  buildTeardownBarcodeTasks(ctx, deps) {
    const queries = dedupeTeardownQueries([
      ctx.barcode || "",
      ...(ctx.nameCandidates || []),
    ]);
    if (queries.length === 0) return [];

    return [
      createTeardownBarcodeTask("LeDenicheur", () =>
        deps.fetchPricesFromLeDenicheur(queries),
      ),
    ];
  },
  healthCheck: createMetadataHealthCheck("ledenicheur", "LeDenicheur", async () => {
    const result = await pingLeDenicheur();
    return {
      ok: result.ok,
      latency: result.latency,
      error: result.error ?? null,
    };
  }),
  testHandlers: {
    "ledenicheur-prices": {
      label: "LeDenicheur - Prices",
      kind: "prices",
      run: (query) => fetchPricesFromLeDenicheur(query),
    },
  },
  mappingProbe: {
    sampleInput: "hades switch",
    context: { name: "hades switch" },
  },
  runMappingProbe: async () =>
    rawProbe(await fetchPricesFromLeDenicheur("hades switch")),
};
