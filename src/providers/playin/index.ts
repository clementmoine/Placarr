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
  fetchPlayInBarcodeProduct,
  fetchPlayInCardPage,
  fetchPlayInProduct,
  searchPlayInCardHits,
  searchPlayInHits,
} from "./fetch";
import { createPlayInResolver, mapPlayInMetadata } from "./resolver";
import {
  lorcanaPrintKeyFromContext,
  playInCardMatchesPrintKey,
} from "./tcgCards";

const fetchFromPlayIn = createPlayInResolver();
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];
const PLAYIN_PROVIDER_KEY = "playin";
const PRICE_SOURCE = "Play-In";

function printKeyFromContext(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

function playInTcgTitleHint(ctx: BarcodePriceRefreshContext): string | null {
  const candidates = [
    ctx.primaryName,
    ctx.primaryTitle,
    ...ctx.acceptanceTitles,
    ...ctx.titles,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);
  return candidates[0] ?? null;
}

async function refreshPlayInTcgOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<ReturnType<typeof pricedOffers>> {
  const printKey = lorcanaPrintKeyFromContext(printKeyFromContext(ctx));
  if (!printKey) return [];

  const pinnedUrls = providerProductUrlsForKey(
    PLAYIN_PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter((url) => /\/carte\/\d+\//i.test(url));

  for (const productUrl of pinnedUrls) {
    try {
      const page = await fetchPlayInCardPage(productUrl);
      if (!playInCardMatchesPrintKey(page, printKey)) continue;
      const offers = offersFromPlayInCardPage(page);
      if (offers.length > 0) return offers;
    } catch (error) {
      console.warn(`[Play-In] TCG pin fetch failed for ${productUrl}:`, error);
    }
  }

  const titleHint = playInTcgTitleHint(ctx);
  if (!titleHint) return [];

  const hits = await searchPlayInCardHits(titleHint, 6);
  for (const hit of hits) {
    try {
      const page = await fetchPlayInCardPage(hit.url);
      if (!playInCardMatchesPrintKey(page, printKey)) continue;
      const offers = offersFromPlayInCardPage(page);
      if (offers.length > 0) return offers;
    } catch (error) {
      console.warn(`[Play-In] TCG card fetch failed for ${hit.url}:`, error);
    }
  }

  return [];
}

function offersFromPlayInCardPage(
  page: Awaited<ReturnType<typeof fetchPlayInCardPage>>,
) {
  return pricedOffers(
    PRICE_SOURCE,
    page.offers.map((offer) => ({
      condition: offer.condition,
      priceCents: offer.priceCents,
      rawValue: page,
      extra: {
        currency: "EUR",
        productName:
          offer.condition === "foil" && page.title
            ? `${page.title} (foil)`
            : (page.title ?? undefined),
        sourceUrl: page.productUrl,
        metadataScoped: true,
      },
    })),
  );
}

async function playInOffersFromPrice(input: {
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
    await promoteRetailPriceEvidence(PLAYIN_PROVIDER_KEY, {
      priceCents: input.priceCents,
      condition: "new",
      productName: input.title ?? undefined,
      sourceUrl: input.productUrl,
    });
  }
  return offers;
}

async function refreshPlayInOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<ReturnType<typeof pricedOffers>> {
  if (ctx.shelfType === "tcg") {
    return refreshPlayInTcgOffers(ctx);
  }

  const resolvedProductUrls = providerProductUrlsForKey(
    PLAYIN_PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter(
    (url) =>
      !ctx.cleanedBarcode ||
      !retailerProductUrlBarcodeConflicts(url, ctx.cleanedBarcode),
  );

  for (const productUrl of resolvedProductUrls) {
    const cached = await readRetailPriceEvidence(
      PLAYIN_PROVIDER_KEY,
      productUrl,
    );
    if (cached) {
      return playInOffersFromPrice({
        title: cached.productName,
        priceCents: cached.priceCents,
        productUrl: cached.sourceUrl || productUrl,
        rawValue: cached,
      });
    }

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
      return playInOffersFromPrice({
        title: product.title,
        priceCents: product.priceCents,
        productUrl: product.productUrl,
        rawValue: product,
        promote: true,
      });
    }
  }

  if (ctx.cleanedBarcode) {
    const hit = await fetchPlayInBarcodeProduct(ctx.cleanedBarcode);
    if (hit?.priceCents != null && hit.priceCents > 0) {
      return playInOffersFromPrice({
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

export const playinModule: ProviderModule = {
  info: {
    id: "playin",
    label: "Play-In",
    types: ["boardgames", "tcg"],
    capabilities: ["identify", "description", "cover", "price"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    websiteUrl: "https://www.play-in.com/fr/",
    scrapeCatalogImageBaseUrl: "https://www.play-in.com",
    notes:
      "Boutique FR : jeux de société (catalogue gamme 5 + JSON-LD) et cartes Lorcana à l'unité (`/fr/carte/…`, match printKey, prix EUR stock).",
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
        // Lorcana singles are identified by printKey (LorcanaJSON), not by the
        // board-game catalogue scraper. TCG prices still flow through
        // refreshBarcodePriceOffers / tcgCards — keep that path only.
        if (ctx.type === "tcg") return null;
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
  barcodeLookupSlots: { playin: () => null },
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
    const hit = payload.playin;
    if (!hit?.priceCents) return [];
    if (hit.productUrl) {
      void promoteRetailPriceEvidence(PLAYIN_PROVIDER_KEY, {
        priceCents: hit.priceCents,
        condition: "new",
        productName: hit.title,
        sourceUrl: hit.productUrl,
      });
    }
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

import type { BarcodeMetadataHit } from "@/core/identify/lookup/payload";

// This module owns the `playin` barcode-lookup slot: it declares its type here
// and its empty value in `info.barcodeLookupSlots`, so core enumerates none.
declare module "@/core/identify/lookup/payload" {
  interface BarcodeLookupSlots {
    playin: BarcodeMetadataHit | null;
  }
}
