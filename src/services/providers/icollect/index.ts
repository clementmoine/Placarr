import { createMetadataHealthCheck } from "@/lib/provider/healthUtils";
import {
  probeBarcodesWithFallback,
  probeErrorResult,
  rawProbe,
} from "@/lib/dev/mappingProbe";
import { pricedOffers } from "@/lib/provider/priceOffers";
import { barcodeSourceFactsFromFields } from "@/lib/barcode/evidence/sourceFacts";
import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import type { BarcodeLookupPayload } from "@/lib/barcode/lookup/payload";

import {
  fetchICollectMetadataByBarcode,
  icollectCoverRegionRole,
  icollectPlatformKey,
  pingICollect,
  type ICollectMetadata,
} from "./fetch";
import { icollectAttachmentRole } from "./imageLabels";

export {
  fetchICollectMetadataByBarcode,
  fetchICollectVideoGameItem,
  pingICollect,
  resolveICollectVideoGameItemUrlByBarcode,
} from "./fetch";
export {
  countICollectBarcodeIndex,
  ensureICollectIndex,
  extractBarcodeEntriesFromSitemapXml,
  icollectIndexPath,
  ingestICollectSitemapXml,
} from "./indexStore";

const FALLBACK_BARCODES = ["0045496365226", "5030917191690", "045496360730"];
const BARCODE_TYPES: BarcodeLookupType[] = ["games", "generic"];
const PRICE_SOURCE = "iCollect Everything";

function buildICollectAttachments(metadata: ICollectMetadata) {
  const seen = new Set<string>();
  const regionRole = icollectCoverRegionRole(metadata.ageRating);
  const attachments: NonNullable<MetadataResult["attachments"]> = [];

  for (const image of metadata.images) {
    if (!image.url || seen.has(image.url)) continue;
    seen.add(image.url);
    const role = icollectAttachmentRole(
      image.label,
      image.url,
      regionRole ?? null,
    );
    attachments.push({
      type: "cover",
      url: image.url,
      source: "icollect",
      ...(role ? { role } : {}),
      ...(image.label ? { title: image.label } : {}),
    });
  }

  if (metadata.coverUrl && !seen.has(metadata.coverUrl)) {
    const coverLabel = metadata.images.find(
      (image) => image.url === metadata.coverUrl,
    )?.label;
    attachments.unshift({
      type: "cover",
      url: metadata.coverUrl,
      source: "icollect",
      role:
        icollectAttachmentRole(
          coverLabel,
          metadata.coverUrl,
          regionRole ?? null,
        ) ?? regionRole,
    });
  }

  return attachments.length > 0 ? attachments : undefined;
}

function metadataToResult(metadata: ICollectMetadata): MetadataResult {
  const facts: NonNullable<MetadataResult["facts"]> = [];

  if (metadata.players) {
    facts.push({
      kind: "players",
      label: "Players",
      value: metadata.players,
      source: "icollect",
      confidence: 0.62,
      priority: 58,
    });
  }

  if (metadata.ageRating) {
    facts.push({
      kind: "age-rating",
      label: "Rating",
      value: metadata.ageRating,
      source: "icollect",
      confidence: 0.58,
      priority: 54,
    });
  }

  if (metadata.ignScore) {
    facts.push({
      kind: "rating",
      label: "IGN",
      value: metadata.ignScore.replace(",", "."),
      source: "icollect",
      confidence: 0.55,
      priority: 50,
    });
  }

  if (metadata.series) {
    facts.push({
      kind: "series",
      label: "Series",
      value: metadata.series,
      source: "icollect",
      confidence: 0.6,
      priority: 52,
    });
  }

  for (const genre of metadata.genres || []) {
    facts.push({
      kind: "genre",
      label: "Genre",
      value: genre,
      source: "icollect",
      confidence: 0.55,
      priority: 48,
    });
  }

  return {
    title: metadata.title,
    platformKey: icollectPlatformKey(metadata.platform) || undefined,
    barcode: metadata.barcode || undefined,
    description: metadata.description || undefined,
    releaseDate: metadata.releaseDate || undefined,
    imageUrl: metadata.coverUrl || undefined,
    attachments: buildICollectAttachments(metadata),
    publishers: metadata.publisher
      ? [{ name: metadata.publisher }]
      : undefined,
    authors: metadata.developer ? [{ name: metadata.developer }] : undefined,
    facts: facts.length > 0 ? facts : undefined,
    externalIds: { icollect: metadata.itemId },
  };
}

function icollectScanOffers(metadata: ICollectMetadata) {
  if (!metadata.estimatedValueCents) return [];
  return pricedOffers(PRICE_SOURCE, [
    {
      condition: "estimated",
      priceCents: metadata.estimatedValueCents,
      rawValue: {
        estimatedValueCents: metadata.estimatedValueCents,
        estimatedValueDate: metadata.estimatedValueDate,
        itemUrl: metadata.itemUrl,
      },
    },
  ]);
}

export const icollectModule: ProviderModule = {
  info: {
    id: "icollect",
    label: "iCollect Everything",
    referencePriceSource: true,
    types: ["games"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "price",
      "players",
      "releaseDate",
      "ageRating",
      "rating",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    isSecondary: true,
    isRealBoxCover: true,
    coverUrlHost: "icollecteverything.com",
    websiteUrl: "https://www.icollecteverything.com/games/",
    mappingProbeRetry: true,
    rateLimited: true,
    notes: "Catalogue jeux vidéo + photos de boîtes + estimation de valeur.",
  },
  evidence: {
    label: "iCollect Everything",
    sourceWeight: 0.42,
  },
  createMetadataAdapter() {
    return {
      id: "icollect",
      async resolve({ barcode }: Parameters<MetadataProviderAdapter["resolve"]>[0]) {
        if (!barcode) return null;
        const metadata = await fetchICollectMetadataByBarcode(barcode);
        return metadata ? metadataToResult(metadata) : null;
      },
    } satisfies MetadataProviderAdapter;
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return {
      ice: deps.fetchICollectMetadataByBarcode(barcode),
    };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchICollectMetadataByBarcode,
  }),
  healthCheck: createMetadataHealthCheck(
    "icollect",
    "iCollect Everything",
    async () => {
      const start = Date.now();
      const isUp = await pingICollect();
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  testHandlers: {
    "icollect-barcode": {
      label: "iCollect Everything - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchICollectMetadataByBarcode(query),
    },
  },
  mappingProbe: {
    sampleInput: "0045496365226",
    context: {
      name: "Mario Kart Wii",
      barcode: "0045496365226",
      platform: "Wii",
    },
    fallbackBarcodes: FALLBACK_BARCODES,
  },
  runMappingProbe: async () => {
    const result = await probeBarcodesWithFallback(
      FALLBACK_BARCODES,
      (barcode) => fetchICollectMetadataByBarcode(barcode),
      rawProbe,
      "iCollect Everything",
    );
    if (result?.mappedKeys.length) return result;
    return probeErrorResult(
      `iCollect Everything: no data for known samples (${FALLBACK_BARCODES.join(", ")})`,
    );
  },
  buildBarcodeSources(payload: BarcodeLookupPayload) {
    const metadata = payload.ice;
    if (!metadata?.title) return [];
    return [
      {
        mediaType: "games" as const,
        label: "iCollect Everything",
        products: [
          {
            name: metadata.platform
              ? `${metadata.title} (${metadata.platform})`
              : metadata.title,
            coverUrl: metadata.coverUrl,
            platformKey: icollectPlatformKey(metadata.platform),
            facts: barcodeSourceFactsFromFields({
              platformKey: icollectPlatformKey(metadata.platform),
              ageRating: metadata.ageRating ?? null,
              players: metadata.players ?? null,
            }),
          },
        ],
      },
    ];
  },
  extractScanPriceOffers(payload, shelfType) {
    if (shelfType !== "games" || !payload.ice) return [];
    return icollectScanOffers(payload.ice);
  },
};
