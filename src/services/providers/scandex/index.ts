import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import {
  probeBarcodesWithFallback,
  probeErrorResult,
  rawProbe,
} from "@/lib/dev/mappingProbe";

import { fetchFromScanDex } from "./fetch";
import { detectPlatformKey } from "@/lib/barcode/query";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";
import type { BarcodeSourceContribution } from "@/types/providerModule";

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
    websiteUrl: "https://scandex.app/",
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
  contributeBarcodeLookupDeps: () => ({
    fetchFromScanDex,
  }),
  testHandlers: {
    "scandex-barcode": {
      label: "ScanDex - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromScanDex(query),
      formatResult: async (resolved, type, { processScrapedNames }) => {
        const payload = resolved as {
          igdb_metadata?: {
            name?: string;
            platform?: { name?: string | null } | null;
          } | null;
        } | null;
        const rawNames = payload?.igdb_metadata?.name
          ? [payload.igdb_metadata.name]
          : [];
        const processed = await processScrapedNames(rawNames, type);
        return {
          ...processed,
          platformName: payload?.igdb_metadata?.platform?.name || null,
          rawResponse: payload,
        };
      },
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
  buildBarcodeSources(payload: BarcodeLookupPayload) {
    const name = payload.sd?.igdb_metadata?.name;
    if (!name) return [];
    const platform = payload.sd?.igdb_metadata?.platform?.name;
    // ScanDex (IGDB) identifies the same product for both games and board games;
    // the type scorer decides which result wins.
    const products = [
      {
        name: platform ? `${name} (${platform})` : name,
        platformKey: platform ? detectPlatformKey(platform) : null,
      },
    ];
    return (["games", "boardgames"] as const).map(
      (mediaType): BarcodeSourceContribution => ({
        mediaType,
        label: "ScanDex",
        products,
      }),
    );
  },
};
