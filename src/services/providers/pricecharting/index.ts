import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import {
  probeBarcodeMetadataSamples,
  rawProbe,
  type BarcodeMetadataProbeSample,
} from "@/lib/dev/mappingProbe";
import { pricedOffers } from "@/lib/provider/priceOffers";

import {
  fetchMetadataFromPriceCharting,
  fetchMetadataFromPriceChartingByName,
  fetchPricesFromPriceCharting,
} from "./fetch";
import { buildPriceChartingCatalogLink } from "./catalogLink";
import { priceChartingAttachmentRole, priceChartingGalleryLabelIsRecognized } from "./imageLabels";
import { cleanCode, detectPlatformKey } from "@/lib/barcode/query";
import { barcodeSourceFactsFromFields } from "@/lib/barcode/evidence/sourceFacts";
import type { PriceChartingMetadata } from "@/lib/barcode/lookup/providerTypes";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";

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
const PRICE_SOURCE = "PriceCharting";

function priceChartingScanOffers(
  prices: NonNullable<NonNullable<PriceChartingMetadata>["prices"]>,
) {
  return pricedOffers(PRICE_SOURCE, [
    { condition: "loose", priceCents: prices.priceUsed, rawValue: prices },
    { condition: "cib", priceCents: prices.priceUsedCIB, rawValue: prices },
    { condition: "new", priceCents: prices.priceNew, rawValue: prices },
  ]);
}

function buildPriceChartingAttachments(
  pcMeta: PriceChartingMetadata,
  isPal: boolean,
) {
  const seen = new Set<string>();
  const attachments: Array<{
    type: "cover";
    url: string;
    source: string;
    role: string;
    title?: string;
  }> = [];

  const push = (url: string | undefined, title?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    attachments.push({
      type: "cover",
      url,
      source: "pricecharting",
      role: priceChartingAttachmentRole(title, isPal),
      ...(title ? { title } : {}),
    });
  };

  for (const image of pcMeta.images || []) {
    if (!priceChartingGalleryLabelIsRecognized(image.label)) continue;
    push(image.url, image.label);
  }
  const primaryImage = pcMeta.images?.find((image) =>
    /main image/i.test(image.label || ""),
  );
  push(pcMeta.coverUrl, primaryImage?.label ?? pcMeta.images?.[0]?.label);

  return attachments.length > 0 ? attachments : undefined;
}

async function refreshPriceChartingOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "games") return [];
  const result = await fetchPricesFromPriceCharting(
    ctx.cleanedBarcode,
    [ctx.primaryName, ...ctx.fallbackNames].filter(Boolean),
    ctx.shelfName ?? "",
    ctx.isPal,
    ctx.isClassics,
  );
  if (!result) return [];
  return pricedOffers(PRICE_SOURCE, [
    { condition: "loose", priceCents: result.priceUsed, rawValue: result },
    { condition: "cib", priceCents: result.priceUsedCIB, rawValue: result },
    { condition: "new", priceCents: result.priceNew, rawValue: result },
  ]);
}

export const pricechartingModule: ProviderModule = {
  info: {
    id: "pricecharting",
    label: "PriceCharting",
    referencePriceSource: true,
    catalogDisplayTitleFallback: true,
    types: ["games"],
    capabilities: ["identify", "price", "cover"],
    auth: { kind: "none" },
    canonical: false,
    websiteUrl: "https://www.pricecharting.com/",
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
        const isPal = cleanedBarcode
          ? cleanedBarcode.length === 13 && !cleanedBarcode.startsWith("0")
          : true;
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
            label: pcMeta.ageRating.startsWith("PEGI")
              ? "PEGI"
              : "PriceCharting",
            value:
              pcMeta.ageRating.replace(/^PEGI\s*/i, "").trim() ||
              pcMeta.ageRating,
            source: "pricecharting",
            confidence: 0.62,
            priority: 58,
          });
        }

        return {
          title: pcMeta.title,
          platformKey: pcMeta.platform
            ? detectPlatformKey(pcMeta.platform) || undefined
            : undefined,
          barcode: pcMeta.barcode || barcode || undefined,
          imageUrl: pcMeta.coverUrl || undefined,
          attachments: buildPriceChartingAttachments(pcMeta, isPal),
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
  contributeBarcodeLookupDeps: () => ({
    fetchMetadataFromPriceCharting,
  }),
  contributeGameBarcodeEnrichment: () => ({
    fetchReferencePriceByBarcode: (
      barcode,
      searchName,
      platform,
      isPal,
      isClassics,
    ) =>
      fetchMetadataFromPriceCharting(
        barcode,
        searchName,
        platform,
        isPal,
        isClassics,
      ),
  }),
  buildCatalogExternalLink(ctx) {
    if (ctx.mediaType !== "games") return null;
    return buildPriceChartingCatalogLink(ctx);
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
    context: {
      name: "Mario Kart Wii",
      barcode: "0045496365226",
      platform: "Wii",
    },
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
  buildBarcodeSources(payload: BarcodeLookupPayload) {
    const pc = payload.pc;
    if (!pc?.title) return [];
    return [
      {
        mediaType: "games" as const,
        label: "PriceCharting",
        products: [
          {
            name: pc.platform ? `${pc.title} (${pc.platform})` : pc.title,
            coverUrl: pc.coverUrl,
            platformKey: pc.platform ? detectPlatformKey(pc.platform) : null,
            facts: barcodeSourceFactsFromFields({
              platformKey: pc.platform ? detectPlatformKey(pc.platform) : null,
              ageRating: pc.ageRating ?? null,
            }),
          },
        ],
      },
    ];
  },
  extractScanPriceOffers(payload, shelfType) {
    if (shelfType !== "games" || !payload.pc?.prices) return [];
    return priceChartingScanOffers(payload.pc.prices);
  },
  refreshBarcodePriceOffers: refreshPriceChartingOffers,
};
