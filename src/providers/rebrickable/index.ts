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
  collectRebrickableMappingRawKeys,
  fetchRebrickableSetByNum,
  rebrickableApiKey,
  resolveRebrickableSet,
  searchRebrickableSets,
  type RebrickableSet,
} from "./fetch";

export {
  fetchRebrickableSetByNum,
  mapRebrickableRawSet,
  rebrickableApiKey,
  resolveRebrickableSet,
  searchRebrickableSets,
} from "./fetch";

const PROVIDER_KEY = "rebrickable";
const SAMPLE_QUERY = "75192-1";

function buildAttachments(
  set: RebrickableSet,
): MetadataAttachment[] | undefined {
  if (!set.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: set.imageUrl,
      title: set.name,
      role: "box",
      source: PROVIDER_KEY,
    },
  ];
}

/** @internal exported for unit tests */
export function mapRebrickableMetadata(
  set: RebrickableSet | null,
): MetadataResult | null {
  if (!set?.name) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Rebrickable",
      value: "Voir la fiche",
      url: set.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 34,
    },
    {
      kind: "identifier",
      label: "Set",
      value: set.setNum,
      source: PROVIDER_KEY,
      confidence: 0.7,
      priority: 40,
    },
  ];

  if (set.numParts != null) {
    facts.push({
      kind: "tag",
      label: "Pièces",
      value: String(set.numParts),
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 28,
    });
  }

  const metadata: MetadataResult = {
    title: set.name,
    releaseDate: set.year != null ? String(set.year) : undefined,
    imageUrl: set.imageUrl,
    regionalTitles: [{ region: "en", text: set.name }],
    attachments: buildAttachments(set),
    facts,
    externalIds: {
      rebrickable: set.setNum,
      legoSet: set.setNum,
    },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Rebrickable",
      sourceDocumentRole: "reference_record",
      sourceUrl: set.sourceUrl,
      sourceId: set.setNum,
      evidenceSignals: ["structured_data", "title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "en",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export const rebrickableModule = defineProvider({
  info: {
    id: "rebrickable",
    label: "Rebrickable",
    types: ["toys"],
    nameDatabase: true,
    capabilities: ["identify", "cover", "releaseDate"],
    auth: { kind: "key", env: ["REBRICKABLE_API_KEY"], free: true },
    supplyMode: "api_live",
    canonical: false,
    defaultLanguage: "en",
    isRealBoxCover: true,
    coverUrlHost: "cdn.rebrickable.com",
    remoteImageReferer: "https://rebrickable.com/",
    remoteImageFallback: true,
    websiteUrl: "https://rebrickable.com/",
    apiKeyDashboardUrl: "https://rebrickable.com/api/",
    mappingProbeConfigHint:
      "REBRICKABLE_API_KEY missing — generate one at rebrickable.com/api/",
    notes:
      "Catalogue LEGO Rebrickable (API v3) : set_num, image, pièces. Complète Brickset (pas d'EAN). Clé gratuite requise.",
  },
  evidence: {
    label: "Rebrickable",
    sourceWeight: 0.4,
    cleanCachedNames: true,
  },
  healthCheck: createKeyHealthCheck(
    "rebrickable",
    "Rebrickable",
    ["REBRICKABLE_API_KEY"],
    (key) =>
      `https://rebrickable.com/api/v3/lego/colors/?key=${encodeURIComponent(key)}&page_size=1`,
    "REBRICKABLE_API_KEY missing",
  ),
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/rebrickable\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
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
        if (!rebrickableApiKey()) return null;
        const pinned =
          pinnedProviderRecordId(ctx, "rebrickable") ||
          pinnedProviderRecordId(ctx, "legoSet");
        if (pinned) {
          const byPin = await fetchRebrickableSetByNum(pinned, ctx.signal);
          if (byPin) return mapRebrickableMetadata(byPin);
        }
        return mapRebrickableMetadata(
          await resolveRebrickableSet({
            name: String(ctx.name || "").trim() || undefined,
            lookupQueries: ctx.lookupQueries,
            signal: ctx.signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const hits = await searchRebrickableSets(cleanedName);
    return hits.slice(0, 8).map((hit) => hit.name);
  },
  metadataSearch: (query) => resolveRebrickableSet({ name: query }),
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: "Millennium Falcon", type: "toys" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapRebrickableMetadata(
        await resolveRebrickableSet({ name: SAMPLE_QUERY }),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectRebrickableMappingRawKeys(ctx.name);
  },
});
