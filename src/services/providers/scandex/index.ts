import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import {
  probeBarcodesWithFallback,
  probeErrorResult,
  rawProbe,
} from "@/lib/mappingProbeUtils";

import { fetchFromScanDex } from "./fetch";

export { fetchFromScanDex };

const FALLBACK_BARCODES = [
  "3307211503465",
  "0045496364649",
  "0045496362409",
  "0045496363949",
  "0045496364175",
  "0045496368104",
];

const BARCODE_TYPES: BarcodeLookupType[] = ["games", "boardgames", "generic"];

export const scandexModule: ProviderModule = {
  info: {
    id: "scandex",
    label: "ScanDex",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["identify"],
    auth: { kind: "key", env: ["SCANDEX_ACCESS_TOKEN"], free: true },
    canonical: false,
  },
  evidence: {
    label: "ScanDex",
    sourceWeight: 0.36,
    canonical: true,
    cleanCachedNames: true,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { sd: deps.fetchFromScanDex(barcode) };
  },
  testHandlers: {
    "scandex-barcode": {
      label: "ScanDex - Barcode",
      kind: "scandex",
      run: (query) => fetchFromScanDex(query),
    },
  },
  mappingProbe: {
    sampleInput: "3307211503465",
    context: { name: "", barcode: "3307211503465" },
    fallbackBarcodes: FALLBACK_BARCODES,
  },
  runMappingProbe: async () => {
    const result = await probeBarcodesWithFallback(
      FALLBACK_BARCODES,
      (barcode) =>
        fetchFromScanDex(barcode, {
          timeoutMs: 7000,
          suppressNotFoundLog: true,
        }),
      rawProbe,
      "ScanDex",
    );
    if (result?.mappedKeys.length) return result;
    return probeErrorResult(
      `ScanDex: no data for known samples (${FALLBACK_BARCODES.join(", ")})`,
    );
  },
  collectMappingRawKeys: async () => {
    for (const barcode of FALLBACK_BARCODES) {
      const data = await fetchFromScanDex(barcode, {
        timeoutMs: 7000,
        suppressNotFoundLog: true,
      });
      if (data && typeof data === "object") return Object.keys(data);
    }
    return [];
  },
};
