import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { pricedOffers } from "@/core/catalog/priceOffers";
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
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchEspritJeuBarcodeProduct,
  fetchEspritJeuProduct,
  searchEspritJeuHits,
} from "./fetch";
import { createEspritJeuResolver, mapEspritJeuMetadata } from "./resolver";

const fetchFromEspritJeu = createEspritJeuResolver();
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];
const ESPRITJEU_PROVIDER_KEY = "espritjeu";
const PRICE_SOURCE = "Esprit Jeu";

async function espritOffersFromPrice(input: {
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
    await promoteRetailPriceEvidence(ESPRITJEU_PROVIDER_KEY, {
      priceCents: input.priceCents,
      condition: "new",
      productName: input.title ?? undefined,
      sourceUrl: input.productUrl,
    });
  }
  return offers;
}

async function refreshEspritJeuOffers(
  ctx: BarcodePriceRefreshContext,
): Promise<ReturnType<typeof pricedOffers>> {
  const resolvedProductUrls = providerProductUrlsForKey(
    ESPRITJEU_PROVIDER_KEY,
    ctx.providerProductUrls,
  ).filter(
    (url) =>
      !ctx.cleanedBarcode ||
      !retailerProductUrlBarcodeConflicts(url, ctx.cleanedBarcode),
  );

  for (const productUrl of resolvedProductUrls) {
    const cached = await readRetailPriceEvidence(
      ESPRITJEU_PROVIDER_KEY,
      productUrl,
    );
    if (cached) {
      return espritOffersFromPrice({
        title: cached.productName,
        priceCents: cached.priceCents,
        productUrl: cached.sourceUrl || productUrl,
        rawValue: cached,
      });
    }

    const product = await fetchEspritJeuProduct(productUrl);
    if (product.priceCents != null && product.priceCents > 0) {
      return espritOffersFromPrice({
        title: product.title,
        priceCents: product.priceCents,
        productUrl: product.productUrl,
        rawValue: product,
        promote: true,
      });
    }
  }

  if (ctx.cleanedBarcode) {
    const hit = await fetchEspritJeuBarcodeProduct(ctx.cleanedBarcode);
    if (hit?.priceCents != null && hit.priceCents > 0) {
      return espritOffersFromPrice({
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

export const espritjeuModule: ProviderModule = {
  info: {
    id: "espritjeu",
    label: "Esprit Jeu",
    types: ["boardgames"],
    capabilities: ["identify", "description", "cover", "price"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    websiteUrl: "https://www.espritjeu.com/",
    notes: "Catalogue FR jeux de société (fiche produit, EAN, galerie).",
  },
  evidence: {
    label: "Esprit Jeu",
    sourceWeight: 0.28,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: "espritjeu",
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromEspritJeu(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck(
    "espritjeu",
    "Esprit Jeu",
    async () => {
      const start = Date.now();
      const isUp = await pingUrl("https://www.espritjeu.com/");
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  testHandlers: {
    "espritjeu-metadata": {
      label: "Esprit Jeu - Metadata",
      kind: "metadata",
      run: (query) => fetchFromEspritJeu({ name: query }),
    },
    "espritjeu-barcode": {
      label: "Esprit Jeu - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromEspritJeu({ name: "", barcode: query }),
    },
  },
  buildBarcodeTasks(_deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { espritjeu: fetchEspritJeuBarcodeProduct(barcode) };
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Esprit Jeu",
      () => fetchFromEspritJeu(ctx),
      "boardgames",
    );
  },
  mappingProbe: {
    sampleInput: "626570614616",
    context: {
      name: "Black Stories - Mort de Rire",
      barcode: "626570614616",
    },
  },
  runMappingProbe: async () => {
    const hits = await searchEspritJeuHits(
      "Black Stories - Mort de Rire",
      "626570614616",
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
        reason: "Aucun produit Esprit Jeu trouvé",
      };
    }
    const product = await fetchEspritJeuProduct(hit.url);
    return metadataProbe(
      mapEspritJeuMetadata({
        ...product,
        barcode: product.barcode || "626570614616",
      }),
    );
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Black Stories - Mort de Rire",
      barcode: "626570614616",
    });
    const hits = await searchEspritJeuHits(ctx.name, ctx.barcode, 1);
    const hit = hits[0];
    if (!hit) return [];
    return mappingRawKeysFromFetch(() => fetchEspritJeuProduct(hit.url));
  },
  buildBarcodeSources(payload) {
    const hit = payload.espritjeu;
    if (!hit?.title?.trim()) return [];
    return [
      {
        mediaType: "boardgames",
        label: "Esprit Jeu",
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
    const hit = payload.espritjeu;
    if (!hit?.priceCents) return [];
    if (hit.productUrl) {
      void promoteRetailPriceEvidence(ESPRITJEU_PROVIDER_KEY, {
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
  refreshBarcodePriceOffers: refreshEspritJeuOffers,
};

export { createEspritJeuResolver, fetchEspritJeuProduct, searchEspritJeuHits };
