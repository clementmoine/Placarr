import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import {
  probeBarcodeMetadataSamples,
  rawProbe,
  type BarcodeMetadataProbeSample,
} from "@/lib/mappingProbeUtils";

import {
  fetchMetadataFromPriceCharting,
  fetchMetadataFromPriceChartingByName,
  fetchPricesFromPriceCharting,
} from "./fetch";
import { cleanCode } from "@/lib/barcode/query";

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
  createMetadataAdapter() {
    return {
      id: "pricecharting",
      async resolve({ name, barcode, platform }: any) {
        const cleanedBarcode = barcode ? cleanCode(barcode) : "";
        const isPal = cleanedBarcode.length === 13 && !cleanedBarcode.startsWith("0");
        let pcMeta: any = null;
        if (cleanedBarcode) {
          pcMeta = await fetchMetadataFromPriceCharting(
            cleanedBarcode,
            name,
            platform || undefined,
            isPal,
          );
        } else {
          pcMeta = await fetchMetadataFromPriceChartingByName(
            name,
            platform || undefined,
            isPal,
          );
        }
        if (!pcMeta) return null;

        const facts: any[] = [];
        if (pcMeta.ageRating) {
          facts.push({
            kind: "age-rating",
            label: pcMeta.ageRating.startsWith("PEGI") ? "PEGI" : "PriceCharting",
            value: pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() || pcMeta.ageRating,
            source: "pricecharting",
            confidence: 0.62,
            priority: 58,
          });
        }

        return {
          title: pcMeta.title,
          barcode: pcMeta.barcode || barcode || undefined,
          imageUrl: pcMeta.coverUrl || undefined,
          attachments: pcMeta.coverUrl
            ? [{ type: "cover" as any, url: pcMeta.coverUrl, source: "pricecharting" }]
            : undefined,
          facts: facts.length > 0 ? facts : undefined,
        };
      },
    } satisfies any;
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
