import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import { probeBarcodesWithFallback, listProbe } from "@/lib/dev/mappingProbe";
import { marketplaceContributions } from "@/lib/barcode/lookup/sourceContribution";

import { fetchFromFreakxy } from "./fetch";

export { fetchFromFreakxy };

const FALLBACK_QUERIES = ["0045496365226", "045496360730", "Mario Kart Wii"];

const BARCODE_TYPES: BarcodeLookupType[] = ["games", "generic"];

export const freakxyModule: ProviderModule = {
  info: {
    id: "freakxy",
    label: "Freakxy",
    types: ["games"],
    capabilities: ["identify", "price"],
    auth: { kind: "scrape" },
    canonical: false,
    websiteUrl: "https://www.freakxy.fr/",
  },
  evidence: {
    label: "Freakxy",
    sourceWeight: 0.1,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { freakxy: deps.fetchFromFreakxy(barcode) };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromFreakxy,
  }),
  testHandlers: {
    "freakxy-barcode": {
      label: "Freakxy - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromFreakxy(query),
    },
  },
  mappingProbe: {
    sampleInput: "0045496365226",
    context: { name: "", barcode: "0045496365226" },
    fallbackBarcodes: FALLBACK_QUERIES,
  },
  runMappingProbe: () =>
    probeBarcodesWithFallback(
      FALLBACK_QUERIES,
      fetchFromFreakxy,
      listProbe,
      "Freakxy",
      { retryAttempts: 2, unreachableStatus: "blocked" },
    ),
  buildBarcodeSources(payload, ctx) {
    return marketplaceContributions("Freakxy", payload.freakxy, ctx, ["games"]);
  },
};
