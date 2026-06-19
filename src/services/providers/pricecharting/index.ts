import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import {
  probeBarcodeMetadataSamples,
  rawProbe,
  type BarcodeMetadataProbeSample,
} from "@/lib/mappingProbeUtils";

import {
  fetchMetadataFromPriceCharting,
  fetchPricesFromPriceCharting,
} from "./fetch";

export { fetchMetadataFromPriceCharting, fetchPricesFromPriceCharting };

const FALLBACK_BARCODES = ["0045496365226", "5030917191690", "045496360730"];

const METADATA_PROBE_SAMPLES: BarcodeMetadataProbeSample[] = [
  {
    barcode: "0045496365226",
    fallbackName: "Mario Kart Wii",
    fallbackPlatform: "Wii",
    isPal: true,
  },
  {
    barcode: "5030917191690",
    fallbackName: "Super Mario Galaxy",
    fallbackPlatform: "Wii",
    isPal: true,
  },
  {
    barcode: "045496360730",
    fallbackName: "Super Smash Bros. Brawl",
    fallbackPlatform: "Wii",
    isPal: false,
  },
];

const BARCODE_TYPES: BarcodeLookupType[] = ["games", "generic"];

export const pricechartingModule: ProviderModule = {
  info: {
    id: "pricecharting",
    label: "PriceCharting",
    types: ["games"],
    capabilities: ["identify", "price"],
    auth: { kind: "none" },
    canonical: false,
    notes: "Prix de référence.",
  },
  evidence: {
    label: "PriceCharting",
    sourceWeight: 0.38,
  },
  buildBarcodeTasks(deps, type, { barcode, platformKey }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    const isPal = barcode.length === 13 && !barcode.startsWith("0");
    return {
      pc: deps.fetchMetadataFromPriceCharting(
        barcode,
        undefined,
        type === "games" ? platformKey || undefined : undefined,
        isPal,
      ),
    };
  },
  testHandlers: {
    "pricecharting-barcode": {
      label: "PriceCharting - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchMetadataFromPriceCharting(query),
    },
  },
  mappingProbe: {
    sampleInput: "0045496365226",
    context: { name: "", barcode: "0045496365226" },
    fallbackBarcodes: FALLBACK_BARCODES,
  },
  runMappingProbe: () =>
    probeBarcodeMetadataSamples(
      METADATA_PROBE_SAMPLES,
      (sample) =>
        fetchMetadataFromPriceCharting(
          sample.barcode,
          sample.fallbackName,
          sample.fallbackPlatform,
          sample.isPal,
        ),
      rawProbe,
      "PriceCharting",
    ),
};
