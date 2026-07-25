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
import {
  promoteRetailPriceEvidence,
  readRetailPriceEvidence,
} from "@/core/enrich/retailPriceEvidence";
import type {
  BarcodeLookupType,
  BarcodePriceRefreshContext,
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchOkkazeoBarcodeProduct,
  fetchOkkazeoGame,
  searchOkkazeo,
} from "./fetch";
import { createOkkazeoResolver, mapOkkazeoMetadata } from "./resolver";

const fetchFromOkkazeo = createOkkazeoResolver();
// "generic" included so typeless home-page scans get this board-game anchor too
// (parity with the video-game stack, which already fires in the generic branch).
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];
const OKKAZEO_PROVIDER_KEY = "okkazeo";
const PRICE_SOURCE = "Okkazeo";

async function okkazeoOffersFromPrice(input: {
  title?: string | null;
  priceCents: number;
  productUrl?: string | null;
  rawValue: unknown;
  promote?: boolean;
}) {
  const offers = pricedOffers(PRICE_SOURCE, [
    {
      condition: "used",
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
    await promoteRetailPriceEvidence(OKKAZEO_PROVIDER_KEY, {
      priceCents: input.priceCents,
      condition: "used",
      productName: input.title ?? undefined,
      sourceUrl: input.productUrl,
    });
  }
  return offers;
}

async function refreshOkkazeoOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<ReturnType<typeof pricedOffers>> {
  const resolvedProductUrls = providerProductUrlsForKey(
    OKKAZEO_PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter(
    (url) =>
      !ctx.cleanedBarcode ||
      !retailerProductUrlBarcodeConflicts(url, ctx.cleanedBarcode),
  );

  for (const productUrl of resolvedProductUrls) {
    const cached = await readRetailPriceEvidence(
      OKKAZEO_PROVIDER_KEY,
      productUrl,
    );
    if (cached) {
      return okkazeoOffersFromPrice({
        title: cached.productName,
        priceCents: cached.priceCents,
        productUrl: cached.sourceUrl || productUrl,
        rawValue: cached,
      });
    }

    const game = await fetchOkkazeoGame(productUrl);
    if (game.priceCents != null && game.priceCents > 0) {
      return okkazeoOffersFromPrice({
        title: game.title,
        priceCents: game.priceCents,
        productUrl: game.productUrl,
        rawValue: game,
        promote: true,
      });
    }
  }

  if (ctx.cleanedBarcode) {
    const hit = await searchOkkazeo("", ctx.cleanedBarcode);
    if (hit) {
      const game = await fetchOkkazeoGame(hit.url);
      const resolvedBarcode = normalizeProductBarcode(game.barcode);
      const itemBarcode = normalizeProductBarcode(ctx.cleanedBarcode);
      if (
        resolvedBarcode &&
        itemBarcode &&
        !barcodesEquivalent(resolvedBarcode, itemBarcode)
      ) {
        return [];
      }
      if (game.priceCents != null && game.priceCents > 0) {
        return okkazeoOffersFromPrice({
          title: game.title,
          priceCents: game.priceCents,
          productUrl: game.productUrl,
          rawValue: game,
          promote: true,
        });
      }
    }
  }

  return [];
}

export const okkazeoModule: ProviderModule = {
  info: {
    id: "okkazeo",
    label: "Okkazeo",
    types: ["boardgames"],
    capabilities: [
      "identify",
      "description",
      "cover",
      "price",
      "players",
      "duration",
      "ageRating",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    websiteUrl: "https://www.okkazeo.com/",
    scrapeCatalogImageBaseUrl: "https://www.okkazeo.com",
    notes:
      "Base FR jeux de société : fiche canonique (JSON-LD) + recherche par EAN.",
  },
  evidence: {
    label: "Okkazeo",
    sourceWeight: 0.3,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: "okkazeo",
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromOkkazeo(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("okkazeo", "Okkazeo", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.okkazeo.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "okkazeo-metadata": {
      label: "Okkazeo - Metadata",
      kind: "metadata",
      run: (query) => fetchFromOkkazeo({ name: query }),
    },
    "okkazeo-barcode": {
      label: "Okkazeo - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromOkkazeo({ name: "", barcode: query }),
    },
  },
  buildBarcodeTasks(_deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { okkazeo: fetchOkkazeoBarcodeProduct(barcode) };
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Okkazeo",
      () => fetchFromOkkazeo(ctx),
      "boardgames",
    );
  },
  mappingProbe: {
    sampleInput: "3421272109517",
    context: { name: "Mille Sabords", barcode: "3421272109517" },
  },
  runMappingProbe: async () => {
    const hit = await searchOkkazeo("", "3421272109517");
    if (!hit) {
      return {
        rawKeys: [],
        mappedKeys: [],
        unusedKeys: [],
        attachmentsCount: 0,
        factsCount: 0,
        example: null,
        statusHint: "empty",
        reason: "Aucun jeu Okkazeo trouvé",
      };
    }
    const game = await fetchOkkazeoGame(hit.url);
    return metadataProbe(
      mapOkkazeoMetadata({
        ...game,
        barcode: game.barcode || "3421272109517",
      }),
    );
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Mille Sabords",
      barcode: "3421272109517",
    });
    const hit = await searchOkkazeo(ctx.name, ctx.barcode || "3421272109517");
    if (!hit) return [];
    return mappingRawKeysFromFetch(() => fetchOkkazeoGame(hit.url));
  },
  barcodeLookupSlots: { okkazeo: () => null },
  buildBarcodeSources(payload) {
    const hit = payload.okkazeo;
    if (!hit?.title?.trim()) return [];
    return [
      {
        mediaType: "boardgames",
        label: "Okkazeo",
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
    const hit = payload.okkazeo;
    if (!hit?.priceCents) return [];
    if (hit.productUrl) {
      void promoteRetailPriceEvidence(OKKAZEO_PROVIDER_KEY, {
        priceCents: hit.priceCents,
        condition: "used",
        productName: hit.title,
        sourceUrl: hit.productUrl,
      });
    }
    return pricedOffers(PRICE_SOURCE, [
      {
        condition: "used",
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
  refreshBarcodePriceOffers: refreshOkkazeoOffers,
};

export { createOkkazeoResolver, fetchOkkazeoGame, searchOkkazeo };

import type { BarcodeMetadataHit } from "@/core/identify/lookup/payload";

// This module owns the `okkazeo` barcode-lookup slot: it declares its type here
// and its empty value in `info.barcodeLookupSlots`, so core enumerates none.
declare module "@/core/identify/lookup/payload" {
  interface BarcodeLookupSlots {
    okkazeo: BarcodeMetadataHit | null;
  }
}
