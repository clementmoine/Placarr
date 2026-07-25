import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { barcodeSourceFactsFromFields } from "@/core/identify/evidence/sourceFacts";
import type {
  BarcodeLookupType,
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchMyLudoBarcodeProduct,
  fetchMyLudoGame,
  searchMyLudoHits,
} from "./fetch";
import { createMyLudoResolver, mapMyLudoMetadata } from "./resolver";

const fetchFromMyLudo = createMyLudoResolver();
const BARCODE_TYPES: BarcodeLookupType[] = ["boardgames", "generic"];

export const myludoModule: ProviderModule = {
  info: {
    id: "myludo",
    label: "MyLudo",
    types: ["boardgames"],
    capabilities: [
      "identify",
      "description",
      "cover",
      "players",
      "duration",
      "ageRating",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    websiteUrl: "https://www.myludo.fr/",
    scrapeCatalogImageBaseUrl: "https://www.myludo.fr",
    notes:
      "Base communautaire FR : API interne (recherche EAN, fiche jeu, galerie).",
  },
  evidence: {
    label: "MyLudo",
    sourceWeight: 0.26,
    trustedRetailer: true,
  },
  createMetadataAdapter() {
    return {
      id: "myludo",
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromMyLudo(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("myludo", "MyLudo", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.myludo.fr/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "myludo-metadata": {
      label: "MyLudo - Metadata",
      kind: "metadata",
      run: (query) => fetchFromMyLudo({ name: query }),
    },
    "myludo-barcode": {
      label: "MyLudo - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromMyLudo({ name: "", barcode: query }),
    },
  },
  buildBarcodeTasks(_deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { myludo: fetchMyLudoBarcodeProduct(barcode) };
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "MyLudo",
      () => fetchFromMyLudo(ctx),
      "boardgames",
    );
  },
  mappingProbe: {
    sampleInput: "626570614616",
    context: {
      name: "Black Stories - Morts de rire",
      barcode: "626570614616",
    },
  },
  runMappingProbe: async () => {
    const hits = await searchMyLudoHits("", "626570614616", 1);
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
        reason: "Aucun jeu MyLudo trouvé",
      };
    }
    const game = await fetchMyLudoGame(hit.url);
    return metadataProbe(mapMyLudoMetadata(game));
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Black Stories - Morts de rire",
      barcode: "626570614616",
    });
    const hits = await searchMyLudoHits(ctx.name, ctx.barcode, 1);
    const hit = hits[0];
    if (!hit) return [];
    return mappingRawKeysFromFetch(() => fetchMyLudoGame(hit.url));
  },
  buildBarcodeSources(payload) {
    const hit = payload.myludo;
    if (!hit?.title?.trim()) return [];
    return [
      {
        mediaType: "boardgames",
        label: "MyLudo",
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

export { createMyLudoResolver, fetchMyLudoGame, searchMyLudoHits };
