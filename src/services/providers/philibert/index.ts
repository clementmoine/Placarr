import { metadataProbe } from "@/lib/mappingProbeUtils";
import { createMetadataHealthCheck, pingUrl } from "@/lib/providerHealthUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import {
  fetchPhilibertBarcodeProduct,
  fetchPhilibertProduct,
  searchPhilibert,
} from "./fetch";
import { createPhilibertResolver } from "./resolver";

type Resolver = (
  name: string,
  barcode?: string | null,
) => Promise<MetadataResult | null>;

const fetchFromPhilibert = createPhilibertResolver();
// "generic" included so typeless home-page scans get a board-game anchor too:
// without it, a board game scanned without a type has no canonical/trusted source
// and gets misclassified as "games" (see runBarcodeLookups generic branch).
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];

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
      async resolve({ name, barcode }: any) {
        return fetchFromPhilibert(name, barcode);
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
      run: (query) => fetchFromPhilibert(query),
    },
    "philibert-barcode": {
      label: "Philibert - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromPhilibert("", query),
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
      () => fetchFromPhilibert(ctx.name, ctx.barcode),
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
};

export { createPhilibertResolver, fetchPhilibertProduct, searchPhilibert };
