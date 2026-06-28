import { metadataProbe } from "@/lib/dev/mappingProbe";
import { pricedOffer } from "@/lib/provider/priceOffers";
import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

import { barcodeSourceFactsFromFields } from "@/lib/barcode/evidence/sourceFacts";
import type { MetadataProviderAdapter, ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import {
  fetchPhilibertBarcodeProduct,
  fetchPhilibertProduct,
  searchPhilibert,
} from "./fetch";
import { createPhilibertResolver } from "./resolver";

const fetchFromPhilibert = createPhilibertResolver();
// "generic" included so typeless home-page scans get a board-game anchor too:
// without it, a board game scanned without a type has no canonical/trusted source
// and gets misclassified as "games" (see runBarcodeLookups generic branch).
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];
const PRICE_SOURCE = "Philibert";

export const philibertModule: ProviderModule = {
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
    canonical: false,
    websiteUrl: "https://www.philibertnet.com/",
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
  healthCheck: createMetadataHealthCheck("philibert", "Philibert", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.philibertnet.com/fr/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
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
    return metadataProbe({
      title: product.title,
      description: product.description,
      imageUrl: product.imageUrl,
      barcode: product.barcode,
      facts: product.priceCents
        ? [{ kind: "price", label: "Prix", value: String(product.priceCents) }]
        : undefined,
    });
  },
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
    if (!payload.philibert?.priceCents) return [];
    const offer = pricedOffer(
      PRICE_SOURCE,
      "new",
      payload.philibert.priceCents,
      payload.philibert,
    );
    return offer ? [offer] : [];
  },
};

export { createPhilibertResolver } from "./resolver";
export { fetchPhilibertProduct, searchPhilibert, searchPhilibertHits } from "./fetch";
