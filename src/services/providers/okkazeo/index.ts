import { metadataProbe } from "@/lib/dev/mappingProbe";
import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

import { barcodeSourceFactsFromFields } from "@/lib/barcode/evidence/sourceFacts";
import type {
  BarcodeLookupType,
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchOkkazeoBarcodeProduct,
  fetchOkkazeoGame,
  searchOkkazeo,
} from "./fetch";
import { createOkkazeoResolver } from "./resolver";

const fetchFromOkkazeo = createOkkazeoResolver();
// "generic" included so typeless home-page scans get this board-game anchor too
// (parity with the video-game stack, which already fires in the generic branch).
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];

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
    websiteUrl: "https://www.okkazeo.com/",
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
    return metadataProbe({
      title: game.title,
      description: game.description,
      imageUrl: game.imageUrl,
      barcode: game.barcode,
      facts: game.priceCents
        ? [{ kind: "price", label: "Prix", value: String(game.priceCents) }]
        : undefined,
    });
  },
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
};

export { createOkkazeoResolver, fetchOkkazeoGame, searchOkkazeo };
