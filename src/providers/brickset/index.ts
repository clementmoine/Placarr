import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { createKeyHealthCheck } from "@/core/catalog/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { throwIfAborted } from "@/lib/http/abort";
import { defineProvider } from "@/providers/shared/defineProvider";
import { pinnedProviderRecordId } from "@/providers/shared/pinnedRecord";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type { MetadataProviderAdapter } from "@/types/providerModule";

import {
  bricksetApiKey,
  collectBricksetMappingRawKeys,
  fetchBricksetSetByNumber,
  resolveBricksetSet,
  searchBricksetSets,
  type BricksetSet,
} from "./fetch";

export {
  bricksetApiKey,
  fetchBricksetSetByNumber,
  mapBricksetRawSet,
  resolveBricksetSet,
  searchBricksetSets,
} from "./fetch";

const PROVIDER_KEY = "brickset";
const SAMPLE_QUERY = "75192-1";

function buildAttachments(set: BricksetSet): MetadataAttachment[] | undefined {
  const url = set.imageUrl || set.thumbnailUrl;
  if (!url) return undefined;
  return [
    {
      type: "cover",
      url,
      title: set.name,
      role: "box",
      source: PROVIDER_KEY,
    },
  ];
}

/** @internal exported for unit tests */
export function mapBricksetMetadata(
  set: BricksetSet | null,
): MetadataResult | null {
  if (!set?.name) return null;

  const barcode =
    normalizeProductBarcode(set.barcodeEan) ||
    normalizeProductBarcode(set.barcodeUpc) ||
    undefined;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Brickset",
      value: "Voir la fiche",
      url: set.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.7,
      priority: 36,
    },
    {
      kind: "identifier",
      label: "Set",
      value: set.setNumber,
      source: PROVIDER_KEY,
      confidence: 0.72,
      priority: 40,
    },
  ];

  if (barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(barcode),
      value: barcode,
      source: PROVIDER_KEY,
      confidence: 0.74,
      priority: 42,
    });
  }

  if (set.theme) {
    facts.push({
      kind: "tag",
      label: "Thème",
      value: set.theme,
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 24,
    });
  }

  if (set.subtheme) {
    facts.push({
      kind: "tag",
      label: "Sous-thème",
      value: set.subtheme,
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 22,
    });
  }

  if (set.pieces != null) {
    facts.push({
      kind: "tag",
      label: "Pièces",
      value: String(set.pieces),
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 28,
    });
  }

  if (set.minifigs != null) {
    facts.push({
      kind: "tag",
      label: "Figurines",
      value: String(set.minifigs),
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 26,
    });
  }

  if (set.ageMin != null || set.ageMax != null) {
    const age =
      set.ageMin != null && set.ageMax != null
        ? `${set.ageMin}–${set.ageMax}`
        : set.ageMin != null
          ? `${set.ageMin}+`
          : `≤${set.ageMax}`;
    facts.push({
      kind: "age-rating",
      label: "Âge",
      value: age,
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 20,
    });
  }

  if (set.rating != null) {
    facts.push({
      kind: "rating",
      label: "Brickset",
      value:
        set.ratingCount && set.ratingCount > 0
          ? `${set.rating}/5 (${set.ratingCount} notes)`
          : `${set.rating}/5`,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 48,
    });
  }

  if (set.retailPriceEur != null) {
    facts.push({
      kind: "price",
      label: "Prix LEGO",
      value: `${(set.retailPriceEur / 100).toFixed(2).replace(".", ",")} €`,
      source: PROVIDER_KEY,
      confidence: 0.5,
      priority: 34,
    });
  }

  const metadata: MetadataResult = {
    title: set.name,
    description: set.description,
    releaseDate: set.year != null ? String(set.year) : undefined,
    imageUrl: set.imageUrl || set.thumbnailUrl,
    barcode,
    regionalTitles: [{ region: "en", text: set.name }],
    attachments: buildAttachments(set),
    facts,
    externalIds: {
      brickset: String(set.setId),
      legoSet: set.setNumber,
    },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Brickset",
      sourceDocumentRole: "reference_record",
      sourceUrl: set.sourceUrl,
      sourceId: String(set.setId),
      evidenceSignals: barcode
        ? ["structured_data", "barcode_match"]
        : ["structured_data", "title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "en",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export const bricksetModule = defineProvider({
  info: {
    id: "brickset",
    label: "Brickset",
    types: ["toys"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "releaseDate",
      "ageRating",
      "price",
    ],
    auth: { kind: "key", env: ["BRICKSET_API_KEY"], free: true },
    supplyMode: "api_live",
    canonical: true,
    defaultLanguage: "en",
    isRealBoxCover: true,
    coverUrlHost: "images.brickset.com",
    remoteImageReferer: "https://brickset.com/",
    remoteImageFallback: true,
    websiteUrl: "https://brickset.com/",
    apiKeyDashboardUrl: "https://brickset.com/tools/webservices/requestkey",
    mappingProbeConfigHint:
      "BRICKSET_API_KEY missing — request a free key at brickset.com/tools/webservices/requestkey",
    notes:
      "Catalogue LEGO Brickset (API v3) : set number, EAN/UPC, boîte, pièces, thème. Clé gratuite requise.",
  },
  evidence: {
    label: "Brickset",
    sourceWeight: 0.46,
    canonical: true,
    cleanCachedNames: true,
  },
  healthCheck: createKeyHealthCheck(
    "brickset",
    "Brickset",
    ["BRICKSET_API_KEY"],
    (key) =>
      `https://brickset.com/api/v3.asmx/checkKey?apiKey=${encodeURIComponent(key)}`,
    "BRICKSET_API_KEY missing",
  ),
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/brickset\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
        return null;
      }
      return parsed.pathname.match(/\/sets\/([^/?#]+)/i)?.[1] ?? null;
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_KEY,
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        if (!bricksetApiKey()) return null;
        const pinned =
          pinnedProviderRecordId(ctx, "brickset") ||
          pinnedProviderRecordId(ctx, "legoSet");
        if (pinned) {
          const byPin = /^\d+$/.test(pinned)
            ? null
            : await fetchBricksetSetByNumber(pinned, ctx.signal);
          if (byPin) return mapBricksetMetadata(byPin);
        }
        return mapBricksetMetadata(
          await resolveBricksetSet({
            name: String(ctx.name || "").trim() || undefined,
            barcode: ctx.barcode ?? undefined,
            lookupQueries: ctx.lookupQueries,
            signal: ctx.signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const hits = await searchBricksetSets(cleanedName);
    return hits.slice(0, 8).map((hit) => hit.name);
  },
  metadataSearch: (query) => resolveBricksetSet({ name: query }),
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: "Millennium Falcon", type: "toys" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBricksetMetadata(await resolveBricksetSet({ name: SAMPLE_QUERY })),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectBricksetMappingRawKeys(ctx.name);
  },
});
