import { metadataProbe } from "@/lib/mappingProbeUtils";
import { createMetadataHealthCheck, pingUrl } from "@/lib/providerHealthUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";

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
      async resolve({ name, barcode }: { name: string; barcode?: string | null }) {
        return fetchFromOkkazeo(name, barcode);
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
      run: (query) => fetchFromOkkazeo(query),
    },
    "okkazeo-barcode": {
      label: "Okkazeo - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromOkkazeo("", query),
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
      () => fetchFromOkkazeo(ctx.name, ctx.barcode),
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
};

export { createOkkazeoResolver, fetchOkkazeoGame, searchOkkazeo };
