import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { pricedOffer, pricedOffers } from "@/core/catalog/priceOffers";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { providerProductUrlsForKey } from "@/core/commerce/pricing/providerProductUrls";
import { barcodeSourceFactsFromFields } from "@/core/identify/evidence/sourceFacts";
import { retailerProductUrlBarcodeConflicts } from "@/core/commerce/retailer/productUrl";
import {
  promoteRetailPriceEvidence,
  readRetailPriceEvidence,
} from "@/core/enrich/retailPriceEvidence";
import type {
  BarcodeLookupType,
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";

import {
  fetchPhilibertBarcodeProduct,
  fetchPhilibertProduct,
  resolvePhilibertBackgroundUrl,
  searchPhilibert,
} from "./fetch";
import { createPhilibertResolver, mapPhilibertMetadata } from "./resolver";

const fetchFromPhilibert = createPhilibertResolver();
// "generic" included so typeless home-page scans get a board-game anchor too:
// without it, a board game scanned without a type has no canonical/trusted source
// and gets misclassified as "games" (see runBarcodeLookups generic branch).
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];
const PHILIBERT_PROVIDER_KEY = "philibert";
const PRICE_SOURCE = "Philibert";

async function philibertOffersFromPrice(input: {
  title?: string | null;
  priceCents: number;
  productUrl?: string | null;
  rawValue: unknown;
  promote?: boolean;
}) {
  const offers = pricedOffers(PRICE_SOURCE, [
    {
      condition: "new",
      priceCents: input.priceCents,
      rawValue: input.rawValue,
      extra: {
        productName: input.title ?? undefined,
        sourceUrl: input.productUrl ?? undefined,
        totalCents: input.priceCents,
      },
    },
  ]);
  if (input.promote && input.productUrl) {
    await promoteRetailPriceEvidence(PHILIBERT_PROVIDER_KEY, {
      priceCents: input.priceCents,
      condition: "new",
      productName: input.title ?? undefined,
      sourceUrl: input.productUrl,
    });
  }
  return offers;
}

async function refreshPhilibertOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<ReturnType<typeof pricedOffers>> {
  const resolvedProductUrls = providerProductUrlsForKey(
    PHILIBERT_PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter(
    (url) =>
      !ctx.cleanedBarcode ||
      !retailerProductUrlBarcodeConflicts(url, ctx.cleanedBarcode),
  );

  for (const productUrl of resolvedProductUrls) {
    const cached = await readRetailPriceEvidence(
      PHILIBERT_PROVIDER_KEY,
      productUrl,
    );
    if (cached) {
      return philibertOffersFromPrice({
        title: cached.productName,
        priceCents: cached.priceCents,
        productUrl: cached.sourceUrl || productUrl,
        rawValue: cached,
      });
    }

    const product = await fetchPhilibertProduct(productUrl);
    if (product.priceCents != null && product.priceCents > 0) {
      return philibertOffersFromPrice({
        title: product.title,
        priceCents: product.priceCents,
        productUrl: product.productUrl || productUrl,
        rawValue: product,
        promote: true,
      });
    }
  }

  if (ctx.cleanedBarcode) {
    const hit = await fetchPhilibertBarcodeProduct(ctx.cleanedBarcode);
    if (hit?.priceCents != null && hit.priceCents > 0) {
      return philibertOffersFromPrice({
        title: hit.title,
        priceCents: hit.priceCents,
        productUrl: hit.productUrl,
        rawValue: hit,
        promote: true,
      });
    }
  }

  return [];
}

export const philibertModule = defineProvider({
  info: {
    id: "philibert",
    label: "Philibert",
    types: ["boardgames"],
    capabilities: [
      "identify",
      "description",
      "cover",
      "price",
      "rating",
      "ageRating",
      "duration",
      "people",
      "players",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    websiteUrl: "https://www.philibertnet.com/",
    scrapeCatalogImageBaseUrl: "https://www.philibertnet.com",
    notes: "Fiches produit FR (description, couverture, prix, avis).",
  },
  evidence: {
    label: "Philibert",
    sourceWeight: 0.28,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: "philibert",
      async resolve(ctx) {
        return fetchFromPhilibert(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheckUrl: "https://www.philibertnet.com/fr/",
  testHandlers: {
    "philibert-metadata": {
      label: "Philibert - Metadata",
      kind: "metadata",
      run: (query) => fetchFromPhilibert({ name: query }),
    },
    "philibert-barcode": {
      label: "Philibert - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromPhilibert({ name: "", barcode: query }),
    },
  },
  buildBarcodeTasks(_deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { philibert: fetchPhilibertBarcodeProduct(barcode) };
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Philibert",
      () => fetchFromPhilibert(ctx),
      "boardgames",
    );
  },
  mappingProbe: {
    sampleInput: "3558380126133",
    context: { name: "Catan", barcode: "3558380126133" },
  },
  runMappingProbe: async () => {
    const hit = await searchPhilibert("Catan", "3558380126133");
    if (!hit) {
      return {
        rawKeys: [],
        mappedKeys: [],
        unusedKeys: [],
        attachmentsCount: 0,
        factsCount: 0,
        example: null,
        statusHint: "empty",
        reason: "Aucun produit Philibert trouvé",
      };
    }
    const product = await fetchPhilibertProduct(hit.url);
    const backgroundImageUrl = await resolvePhilibertBackgroundUrl(product);
    return metadataProbe(
      mapPhilibertMetadata({
        ...product,
        title: product.title || hit.title,
        barcode: product.barcode || hit.barcode || "3558380126133",
        backgroundImageUrl,
      }),
    );
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Catan",
      barcode: "3558380126133",
    });
    const hit = await searchPhilibert(ctx.name, ctx.barcode || "3558380126133");
    if (!hit) return [];
    return mappingRawKeysFromFetch(() => fetchPhilibertProduct(hit.url));
  },
  barcodeLookupSlots: { philibert: () => null },
  buildBarcodeSources(payload) {
    const hit = payload.philibert;
    if (!hit?.title?.trim()) return [];
    return [
      {
        mediaType: "boardgames",
        label: "Philibert",
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
    const hit = payload.philibert;
    if (!hit?.priceCents) return [];
    const offer = pricedOffer(PRICE_SOURCE, "new", hit.priceCents, hit, {
      productName: hit.title,
      sourceUrl: hit.productUrl ?? undefined,
      totalCents: hit.priceCents,
    });
    if (offer && hit.productUrl) {
      void promoteRetailPriceEvidence(PHILIBERT_PROVIDER_KEY, {
        priceCents: hit.priceCents,
        condition: "new",
        productName: hit.title,
        sourceUrl: hit.productUrl,
      });
    }
    return offer ? [offer] : [];
  },
  refreshBarcodePriceOffers: refreshPhilibertOffers,
});

export { createPhilibertResolver } from "./resolver";
export {
  fetchPhilibertProduct,
  searchPhilibert,
  searchPhilibertHits,
} from "./fetch";

import type { BarcodeMetadataHit } from "@/core/identify/lookup/payload";

// This module owns the `philibert` barcode-lookup slot: it declares its type here
// and its empty value in `info.barcodeLookupSlots`, so core enumerates none.
declare module "@/core/identify/lookup/payload" {
  interface BarcodeLookupSlots {
    philibert: BarcodeMetadataHit | null;
  }
}
