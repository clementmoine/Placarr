import { createMetadataHealthCheck, pingUrl } from "@/lib/providerHealthUtils";
import { catalogForShelfType } from "@/lib/providerCatalog";
import { listProbe, probeErrorResult, retry } from "@/lib/mappingProbeUtils";
import { createTeardownBarcodeTask } from "@/lib/teardownUtils";

import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";

import {
  fetchFromChasseAuxLivres,
  fetchPricesFromChasseAuxLivres,
  isChasseAuxLivresSearchProtected,
} from "./fetch";

export {
  fetchFromChasseAuxLivres,
  fetchPricesFromChasseAuxLivres,
  isChasseAuxLivresSearchProtected,
};

const BARCODE_TYPES: BarcodeLookupType[] = [
  "games",
  "books",
  "musics",
  "movies",
  "boardgames",
  "generic",
];

const CATALOG: Record<BarcodeLookupType, string> = {
  games: "jeuxvideo",
  books: "fr",
  musics: "music",
  movies: "dvd",
  boardgames: "toys",
  generic: "",
};

export const chasseauxlivresModule: ProviderModule = {
  info: {
    id: "chasseauxlivres",
    label: "Chasse aux Livres",
    types: ["books", "musics", "movies", "boardgames"],
    capabilities: ["identify", "price", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  evidence: {
    label: "ChasseAuxLivres",
    sourceWeight: 0.16,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return {
      cal: deps.fetchFromChasseAuxLivres(barcode, CATALOG[type], {
        withPrices: true,
      }),
    };
  },
  buildTeardownBarcodeTasks(ctx, deps) {
    if (!ctx.barcode) return [];

    const catalogEntries = ctx.type
      ? [
          {
            label: "ChasseAuxLivres",
            catalog: CATALOG[ctx.type as BarcodeLookupType] || "",
          },
        ]
      : [
          { label: "ChasseAuxLivres:books", catalog: "fr" },
          { label: "ChasseAuxLivres:movies", catalog: "dvd" },
          { label: "ChasseAuxLivres:musics", catalog: "music" },
          { label: "ChasseAuxLivres:games", catalog: "jeuxvideo" },
          { label: "ChasseAuxLivres:boardgames", catalog: "toys" },
        ];

    return catalogEntries.map((entry) =>
      createTeardownBarcodeTask(entry.label, () =>
        deps.fetchFromChasseAuxLivres(ctx.barcode!, entry.catalog),
      ),
    );
  },
  healthCheck: createMetadataHealthCheck(
    "chasseauxlivres",
    "Chasse aux Livres",
    async () => {
      const start = Date.now();
      const isUp = await pingUrl("https://www.chasse-aux-livres.fr");
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  testHandlers: {
    "chasseauxlivres-barcode": {
      label: "Chasse aux Livres - Barcode",
      kind: "scraped-list",
      run: (query, type) =>
        fetchFromChasseAuxLivres(query, catalogForShelfType(type)),
    },
  },
  mappingProbe: {
    sampleInput: "9780140328721",
    context: { name: "", barcode: "9780140328721" },
    catalog: "fr",
  },
  runMappingProbe: async () => {
    const products = await retry(
      () => fetchFromChasseAuxLivres("9780140328721", "fr"),
      2,
    );
    const probe = listProbe(products);
    if (probe) return probe;
    if (await isChasseAuxLivresSearchProtected("9780140328721", "fr")) {
      return probeErrorResult(
        "Search redirects to a protected login page — Chasse aux Livres blocks anonymous server requests",
        "blocked",
      );
    }
    return probeErrorResult(
      "No listing for sample ISBN — site HTML may have changed or blocked the request",
      "empty",
    );
  },
};
