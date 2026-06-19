import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import { probeBarcodesWithFallback, listProbe } from "@/lib/mappingProbeUtils";

import { fetchFromApriloshop } from "./fetch";

export { fetchFromApriloshop };

const FALLBACK_BARCODES = ["0045496365226", "045496360730"];

const BARCODE_TYPES: BarcodeLookupType[] = ["games", "generic"];

export const apriloshopModule: ProviderModule = {
  info: {
    id: "apriloshop",
    label: "Apriloshop",
    types: ["games"],
    capabilities: ["identify", "price", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  evidence: {
    label: "Apriloshop",
    sourceWeight: 0.1,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { aprilo: deps.fetchFromApriloshop(barcode) };
  },
  testHandlers: {
    "apriloshop-barcode": {
      label: "Apriloshop - Barcode",
      kind: "scraped-list",
      run: (query) => fetchFromApriloshop(query),
    },
  },
  mappingProbe: {
    sampleInput: "0045496365226",
    context: { name: "", barcode: "0045496365226" },
    fallbackBarcodes: FALLBACK_BARCODES,
  },
  runMappingProbe: () =>
    probeBarcodesWithFallback(
      FALLBACK_BARCODES,
      fetchFromApriloshop,
      listProbe,
      "Apriloshop",
    ),
};
