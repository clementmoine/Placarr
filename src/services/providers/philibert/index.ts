import { metadataProbe } from "@/lib/mappingProbeUtils";
import {
  createMetadataHealthCheck,
  pingUrl,
} from "@/lib/providerHealthUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import { fetchPhilibertProduct, searchPhilibert } from "./fetch";
import { createPhilibertResolver } from "./resolver";

type Resolver = (
  name: string,
  barcode?: string | null,
) => Promise<MetadataResult | null>;

const fetchFromPhilibert = createPhilibertResolver();

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
    sourceWeight: 0.18,
  },
  createMetadataAdapter(deps) {
    const fetchFromPhilibert = deps.fetchFromPhilibert as Resolver;
    return {
      id: "philibert",
      async resolve({ name, barcode }) {
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
