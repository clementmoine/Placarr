import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchBdphileIssueById,
  fetchBdphileIssueByUrl,
  fetchBdphileMetadata,
  type BdphileIssue,
} from "./fetch";
import {
  pinnedProviderRecordId,
  pinnedProviderRecordUrl,
} from "@/providers/shared/pinnedRecord";

export {
  composeBdphileIssueTitle,
  fetchBdphileIssueById,
  fetchBdphileIssueByUrl,
  fetchBdphileMetadata,
  fetchBdphileRevueIndex,
  parseBdphileFormatField,
  parseBdphileIssuePage,
  parseBdphileRevueIndexPage,
  parseBdphileRevueIssueLinks,
  pickBdphileIssueLink,
  rankBdphileRevues,
  resetBdphileRevueIndexCache,
} from "./fetch";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildBdphileAttachments(
  issue: BdphileIssue,
): MetadataAttachment[] | undefined {
  if (!issue.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: issue.imageUrl,
      title: issue.title,
      role: "fr",
      source: "bdphile",
    },
  ];
}

function mapBdphileMetadata(issue: BdphileIssue | null): MetadataResult | null {
  if (!issue?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "BDphile",
      value: "Voir la fiche",
      url: issue.sourceUrl,
      source: "bdphile",
      confidence: 0.62,
      priority: 32,
    },
  ];

  if (issue.revueName) {
    facts.push({
      kind: "series",
      label: "Revue",
      value: issue.revueName,
      source: "bdphile",
      confidence: 0.6,
      priority: 28,
    });
  }

  if (issue.issueNumber) {
    facts.push({
      kind: "tag",
      label: "Numéro",
      value: issue.issueNumber,
      source: "bdphile",
      confidence: 0.62,
      priority: 28,
    });
  }

  if (issue.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: issue.releaseDate,
      source: "bdphile",
      confidence: 0.58,
      priority: 22,
    });
  }

  if (issue.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: issue.publisher,
      source: "bdphile",
      confidence: 0.56,
      priority: 23,
    });
  }

  if (issue.issn) {
    facts.push({
      kind: "identifier",
      label: "ISSN",
      value: issue.issn,
      source: "bdphile",
      confidence: 0.58,
      priority: 38,
    });
  }

  if (issue.pageCount) {
    facts.push({
      kind: "tag",
      label: "Pages",
      value: String(issue.pageCount),
      source: "bdphile",
      confidence: 0.56,
      priority: 18,
    });
  }

  if (issue.formatLabel) {
    facts.push({
      kind: "tag",
      label: "Format",
      value: issue.formatLabel,
      source: "bdphile",
      confidence: 0.54,
      priority: 17,
    });
  }

  if (issue.periodicity) {
    facts.push({
      kind: "tag",
      label: "Périodicité",
      value: issue.periodicity,
      source: "bdphile",
      confidence: 0.52,
      priority: 16,
    });
  }

  if (issue.priceNewCents) {
    facts.push({
      kind: "price",
      label: "Tarif catalogue",
      value: formatEuroPrice(issue.priceNewCents),
      source: "bdphile",
      confidence: 0.54,
      priority: 50,
    });
  }

  const metadata: MetadataResult = {
    title: issue.title,
    publishers: issue.publisher ? [{ name: issue.publisher }] : undefined,
    description: issue.description,
    releaseDate: issue.releaseDate,
    pageCount: issue.pageCount,
    imageUrl: issue.imageUrl,
    regionalTitles: [{ region: "fr", text: issue.title }],
    attachments: buildBdphileAttachments(issue),
    facts,
    externalIds: { bdphile: issue.id },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: "bdphile",
      providerLabel: "BDphile",
      sourceDocumentRole: "reference_record",
      sourceUrl: issue.sourceUrl,
      sourceId: issue.id,
      evidenceSignals: ["structured_data", "title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export const bdphileModule: ProviderModule = {
  info: {
    id: "bdphile",
    label: "BDphile",
    types: ["books"],
    capabilities: ["identify", "cover", "releaseDate", "description", "price"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    bookCoverPriority: "primary",
    bookGallerySource: true,
    remoteImageFallback: true,
    remoteImageReferer: "https://www.bdphile.fr/",
    coverUrlHost: "static.bdphile.fr",
    websiteUrl: "https://www.bdphile.fr/",
    requiresTitleAlignment: true,
    notes:
      "Base BD communautaire FR — section Revues (magazines) uniquement : /search/ et /auto_completion/ sont robots-interdits, la résolution passe par l'index alphabétique /revue/?start=N (cache en mémoire) puis la liste des numéros. Titre requis avec numéro ; pas d'EAN sur les revues. robots.txt bannit ClaudeBot/bots SEO mais autorise les agents génériques.",
  },
  evidence: {
    label: "BDphile",
    sourceWeight: 0.26,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/bdphile\.fr$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
        return null;
      }
      return parsed.pathname.match(/\/revue\/numero\/(\d+)\/?/i)?.[1] ?? null;
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: "bdphile",
      async resolve(ctx) {
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "bdphile");
        if (pinnedUrl) {
          const pinned = mapBdphileMetadata(
            await fetchBdphileIssueByUrl(pinnedUrl),
          );
          if (pinned) return pinned;
        }
        const pinnedId = pinnedProviderRecordId(ctx, "bdphile");
        if (pinnedId) {
          const pinned = mapBdphileMetadata(
            await fetchBdphileIssueById(pinnedId),
          );
          if (pinned) return pinned;
        }

        const queries =
          ctx.lookupQueries && ctx.lookupQueries.length > 0
            ? ctx.lookupQueries
            : [String(ctx.name || "").trim()];
        for (const query of queries) {
          if (!query?.trim()) continue;
          const metadata = mapBdphileMetadata(
            await fetchBdphileMetadata(query.trim()),
          );
          if (metadata) return metadata;
        }
        return null;
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheck: createMetadataHealthCheck("bdphile", "BDphile", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.bdphile.fr/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "bdphile-metadata": {
      label: "BDphile - Revue",
      kind: "metadata",
      run: (query) => fetchBdphileMetadata(query),
    },
  },
  mappingProbe: {
    sampleInput: "Super Picsou Géant n°7",
    context: { name: "Super Picsou Géant n°7" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBdphileMetadata(await fetchBdphileMetadata("Super Picsou Géant n°7")),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Super Picsou Géant n°7",
    });
    return mappingRawKeysFromFetch(() => fetchBdphileMetadata(ctx.name));
  },
};
