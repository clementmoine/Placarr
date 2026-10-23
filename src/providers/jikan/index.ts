import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
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
  collectJikanMappingRawKeys,
  resolveJikanManga,
  searchJikanManga,
  type JikanManga,
} from "./fetch";

export {
  fetchJikanMangaById,
  mapJikanRawManga,
  resolveJikanManga,
  searchJikanManga,
} from "./fetch";

const PROVIDER_KEY = "jikan";
const SAMPLE_QUERY = "Monster";

function formatMalAuthor(name: string): string {
  // MAL often stores "Urasawa, Naoki" — mapJikanRawManga already normalizes commas.
  return name.trim();
}

function buildAttachments(manga: JikanManga): MetadataAttachment[] | undefined {
  if (!manga.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: manga.imageUrl,
      title: manga.title,
      role: "wor",
      source: PROVIDER_KEY,
    },
  ];
}

/** @internal exported for unit tests */
export function mapJikanMetadata(
  manga: JikanManga | null,
): MetadataResult | null {
  if (!manga?.title) return null;

  const aliases = Array.from(
    new Set(
      [manga.titleEnglish, manga.titleJapanese, ...manga.titleSynonyms]
        .map((name) => name?.trim())
        .filter(
          (name): name is string => Boolean(name) && name !== manga.title,
        ),
    ),
  );

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "MyAnimeList",
      value: "Voir la fiche",
      url: manga.sourceUrl,
      source: PROVIDER_KEY,
      confidence: 0.66,
      priority: 34,
    },
  ];

  if (manga.score != null) {
    facts.push({
      kind: "rating",
      label: "MAL",
      value:
        manga.scoredBy && manga.scoredBy > 0
          ? `${manga.score}/10 (${manga.scoredBy.toLocaleString("fr-FR")} notes)`
          : `${manga.score}/10`,
      source: PROVIDER_KEY,
      confidence: 0.62,
      priority: 50,
    });
  }

  if (manga.type) {
    facts.push({
      kind: "format",
      label: "Type",
      value: manga.type,
      source: PROVIDER_KEY,
      confidence: 0.58,
      priority: 22,
    });
  }

  if (manga.volumes != null) {
    facts.push({
      kind: "tag",
      label: "Volumes",
      value: String(manga.volumes),
      source: PROVIDER_KEY,
      confidence: 0.6,
      priority: 28,
    });
  }

  if (manga.chapters != null) {
    facts.push({
      kind: "tag",
      label: "Chapitres",
      value: String(manga.chapters),
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 26,
    });
  }

  if (manga.status) {
    facts.push({
      kind: "tag",
      label: "Statut",
      value: manga.status,
      source: PROVIDER_KEY,
      confidence: 0.54,
      priority: 20,
    });
  }

  for (const genre of manga.genres.slice(0, 8)) {
    facts.push({
      kind: "tag",
      label: "Genre",
      value: genre,
      source: PROVIDER_KEY,
      confidence: 0.52,
      priority: 18,
    });
  }

  for (const demo of manga.demographics) {
    facts.push({
      kind: "tag",
      label: "Public",
      value: demo,
      source: PROVIDER_KEY,
      confidence: 0.54,
      priority: 19,
    });
  }

  if (manga.publishedString) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: manga.publishedString,
      source: PROVIDER_KEY,
      confidence: 0.56,
      priority: 22,
    });
  }

  const regionalTitles = [
    { region: "en" as const, text: manga.titleEnglish || manga.title },
    ...(manga.titleJapanese
      ? [{ region: "jp" as const, text: manga.titleJapanese }]
      : []),
  ];

  const metadata: MetadataResult = {
    title: manga.titleEnglish?.trim() || manga.title,
    authors: manga.authors.map((name) => ({ name: formatMalAuthor(name) })),
    description: manga.synopsis,
    releaseDate: manga.publishedFrom,
    imageUrl: manga.imageUrl,
    aliases: aliases.length ? aliases : undefined,
    regionalTitles,
    attachments: buildAttachments(manga),
    facts,
    externalIds: { jikan: String(manga.malId), mal: String(manga.malId) },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_KEY,
      providerLabel: "Jikan (MAL)",
      sourceDocumentRole: "reference_record",
      sourceUrl: manga.sourceUrl,
      sourceId: String(manga.malId),
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

export const jikanModule = defineProvider({
  info: {
    id: "jikan",
    label: "Jikan (MAL)",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "people",
      "releaseDate",
    ],
    auth: { kind: "none" },
    supplyMode: "api_live",
    canonical: false,
    defaultLanguage: "en",
    websiteUrl: "https://jikan.moe/",
    bookCoverPriority: "secondary",
    requiresTitleAlignment: true,
    coverUrlHost: "cdn.myanimelist.net",
    remoteImageReferer: "https://myanimelist.net/",
    remoteImageFallback: true,
    notes:
      "Proxy Jikan v4 de MyAnimeList : fiche série manga (titres EN/JP, note /10, auteurs, genres). Pas d'ISBN / volume FR — complément de Nautiljon.",
  },
  evidence: {
    label: "Jikan",
    sourceWeight: 0.34,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./i, "");
      if (/myanimelist\.net$/i.test(host)) {
        return parsed.pathname.match(/\/manga\/(\d+)/i)?.[1] ?? null;
      }
      if (/jikan\.moe$/i.test(host)) {
        return parsed.pathname.match(/\/manga\/(\d+)/i)?.[1] ?? null;
      }
      return null;
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_KEY,
      async resolve(ctx) {
        throwIfAborted(ctx.signal);
        const pinnedId =
          pinnedProviderRecordId(ctx, "jikan") ||
          pinnedProviderRecordId(ctx, "mal");
        return mapJikanMetadata(
          await resolveJikanManga({
            name: String(ctx.name || "").trim() || undefined,
            malId: pinnedId,
            lookupQueries: ctx.lookupQueries,
            signal: ctx.signal,
          }),
        );
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const hits = await searchJikanManga(cleanedName);
    return hits.slice(0, 8).map((hit) => hit.titleEnglish || hit.title);
  },
  metadataSearch: (query) => resolveJikanManga({ name: query }),
  mappingProbe: {
    sampleInput: SAMPLE_QUERY,
    context: { name: SAMPLE_QUERY, type: "books" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapJikanMetadata(await resolveJikanManga({ name: SAMPLE_QUERY })),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, { name: SAMPLE_QUERY });
    return collectJikanMappingRawKeys(ctx.name);
  },
});
