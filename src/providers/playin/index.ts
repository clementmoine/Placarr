import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import { barcodeSourceFactsFromFields } from "@/core/identify/evidence/sourceFacts";
import { retailerProductUrlBarcodeConflicts } from "@/core/commerce/retailer/productUrl";
import type {
  BarcodeLookupType,
  BarcodePriceRefreshContext,
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchPlayInBarcodeProduct,
  fetchPlayInProduct,
  searchPlayInHits,
} from "./fetch";
import { createPlayInResolver, mapPlayInMetadata } from "./resolver";

const fetchFromPlayIn = createPlayInResolver();
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];
const PLAYIN_PROVIDER_KEY = "playin";
const PRICE_SOURCE = "Play-In";

async function refreshPlayInOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<ReturnType<typeof pricedOffers>> {
  const resolvedProductUrls = providerProductUrlsForKey(
    PLAYIN_PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter(
    (url) =>
      !ctx.cleanedBarcode ||
      !retailerProductUrlBarcodeConflicts(url, ctx.cleanedBarcode),
  );

  for (const productUrl of resolvedProductUrls) {
    const product = await fetchPlayInProduct(productUrl);
    const itemBarcode = normalizeProductBarcode(ctx.cleanedBarcode);
    const resolvedBarcode = normalizeProductBarcode(product.barcode);
    if (
      itemBarcode &&
      resolvedBarcode &&
      !barcodesEquivalent(resolvedBarcode, itemBarcode)
    ) {
      continue;
    }
    if (product.priceCents != null && product.priceCents > 0) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "new",
          priceCents: product.priceCents,
          rawValue: product,
          extra: {
            productName: product.title,
            sourceUrl: product.productUrl,
            totalCents: product.priceCents,
          },
        },
      ]);
    }
  }

  if (ctx.cleanedBarcode) {
    const hit = await fetchPlayInBarcodeProduct(ctx.cleanedBarcode);
    if (hit?.priceCents != null && hit.priceCents > 0) {
      return pricedOffers(PRICE_SOURCE, [
        {
          condition: "new",
          priceCents: hit.priceCents,
          rawValue: hit,
          extra: {
            productName: hit.title,
            sourceUrl: hit.productUrl ?? undefined,
            totalCents: hit.priceCents,
          },
        },
      ]);
    }
  }

  return [];
}

export const playinModule: ProviderModule = {
  info: {
    id: "playin",
    label: "Play-In",
    types: ["boardgames"],
    capabilities: ["identify", "description", "cover", "price"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    websiteUrl: "https://www.play-in.com/fr/",
    notes:
      "Boutique FR jeux de société : catalogue gamme 5 + fiche JSON-LD (gtin14).",
  },
  evidence: {
    label: "Play-In",
    sourceWeight: 0.28,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: "playin",
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromPlayIn(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("playin", "Play-In", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.play-in.com/fr/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "playin-metadata": {
      label: "Play-In - Metadata",
      kind: "metadata",
      run: (query) => fetchFromPlayIn({ name: query }),
    },
    "playin-barcode": {
      label: "Play-In - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromPlayIn({ name: "", barcode: query }),
    },
  },
  buildBarcodeTasks(_deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { playin: fetchPlayInBarcodeProduct(barcode) };
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Play-In",
      () => fetchFromPlayIn(ctx),
      "boardgames",
    );
  },
  mappingProbe: {
    sampleInput: "626570614616",
    context: {
      name: "Black Stories - Morts de Rire",
      barcode: "626570614616",
    },
  },
  runMappingProbe: async () => {
    const hits = await searchPlayInHits(
      "Black Stories - Morts de Rire",
      null,
      1,
    );
    const hit = hits[0];
    if (!hit) {
      return {
        rawKeys: [],
        mappedKeys: [],
        unusedKeys: [],
        attachmentsCount: 0,
        factsCount: 0,
        example: null,
        statusHint: "empty",
        reason: "Aucun produit Play-In trouvé",
      };
    }
    const product = await fetchPlayInProduct(hit.url);
    return metadataProbe(
      mapPlayInMetadata({
        ...product,
        barcode: product.barcode || "626570614616",
      }),
    );
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Black Stories - Morts de Rire",
      barcode: "626570614616",
    });
    const hits = await searchPlayInHits(ctx.name, ctx.barcode, 1);
    const hit = hits[0];
    if (!hit) return [];
    return mappingRawKeysFromFetch(() => fetchPlayInProduct(hit.url));
  },
  buildBarcodeSources(payload) {
    const hit = payload.playin;
    if (!hit?.title?.trim()) return [];
    return [
      {
        mediaType: "boardgames",
        label: "Play-In",
        products: [
          {
            name: hit.title.trim(),
            coverUrl: hit.imageUrl || null,
            facts: barcodeSourceFactsFromFields(hit),
          },
        ],
      },
    ];
  },
  extractScanPriceOffers(payload) {
    if (!payload.playin?.priceCents) return [];
    const hit = payload.playin;
    return pricedOffers(PRICE_SOURCE, [
      {
        condition: "new",
        priceCents: hit.priceCents,
        rawValue: hit,
        extra: {
          productName: hit.title,
          sourceUrl: hit.productUrl ?? undefined,
          totalCents: hit.priceCents,
        },
      },
    ]);
  },
  refreshBarcodePriceOffers: refreshPlayInOffers,
};

export { createPlayInResolver, fetchPlayInProduct, searchPlayInHits };
