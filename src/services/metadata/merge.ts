import { AttachmentType } from "@prisma/client";
import type { MediaType } from "@/types/providerRegistry";
import { PROVIDERS } from "@/services/provider/registry";
import { withProviderAttachmentTraits } from "@/services/provider/sourceTraits";
import {
  isDisplayObservation,
  isRejectedObservation,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationEvidenceRank,
} from "@/lib/metadata/observations";
import {
  pickBestCoverFromAttachments,
  pickBestDisplayImageUrl,
  rankCoverGalleryAttachments,
} from "@/lib/media/attachmentDisplayScore";
import {
  collectMergedSearchAliases,
  promoteTitleKeepingAliases,
} from "@/lib/metadata/aliases";
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import {
  requestedTitleCoversCurrentTitle,
  scoreMetadataDisplayTitle,
} from "@/lib/title/displayScore";
import {
  isMetadataTitleAligned,
  descriptionMatchesRequestedTitle,
} from "@/lib/metadata/titleMatching";
import { metadataTitleSimilarity } from "@/lib/metadata/titleMatching";
import {
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/lib/locale/preference";
import { dedupeFacts, dedupeFieldEvidence } from "@/services/metadata/facts";
import {
  factObservationRankScore,
  pickBestFactObservationsByGroup,
  pickCoverUrlFromObservations,
} from "@/lib/barcode/evidence/ranking";
import { coverUrlQualityRank } from "@/services/provider/registry";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  TitleObservation,
  TitleObservationRole,
  FactObservation,
  MetadataObservation,
} from "@/types/metadataObservation";

export function pickBestMetadataTitle(
  candidates: Array<string | undefined | null>,
): string | undefined {
  const unique = Array.from(
    new Set(
      candidates
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  );
  if (unique.length === 0) return undefined;
  if (unique.length === 1) return unique[0];
  return unique.sort(
    (a, b) => scoreMetadataDisplayTitle(b) - scoreMetadataDisplayTitle(a),
  )[0];
}

type ObservationTitleTier =
  | "object_or_catalog_with_locale"
  | "object_or_catalog"
  | "alias_or_edition"
  | "locale_hint"
  | "listing_or_user";

const OBSERVATION_TITLE_TIER_ORDER: ObservationTitleTier[] = [
  "object_or_catalog_with_locale",
  "object_or_catalog",
  "alias_or_edition",
  "locale_hint",
  "listing_or_user",
];

interface TitleCleanliness {
  punctuationCount: number;
  tokenCount: number;
  length: number;
}

interface RankedObservationTitle {
  key: string;
  value: string;
  tier: ObservationTitleTier;
  evidenceRank: number;
  cleanliness: TitleCleanliness;
}

interface AggregatedObservationTitle extends RankedObservationTitle {
  mentions: number;
}

function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tierRank(tier: ObservationTitleTier): number {
  return OBSERVATION_TITLE_TIER_ORDER.indexOf(tier);
}

function isObjectOrCatalogRole(role: TitleObservationRole): boolean {
  return role === "object_title" || role === "catalog_title";
}

function isAliasOrEditionRole(role: TitleObservationRole): boolean {
  return role === "alias_title" || role === "edition_title";
}

function hasLocaleHint(observation: TitleObservation): boolean {
  const language = observation.language?.toLowerCase().trim();
  const hasLanguage = Boolean(language && language !== "unknown");
  const hasRegion = Boolean(observation.region?.trim());
  return hasLanguage || hasRegion;
}

function titleObservationTier(observation: TitleObservation): ObservationTitleTier {
  const localeHint = hasLocaleHint(observation);
  if (isObjectOrCatalogRole(observation.role)) {
    return localeHint
      ? "object_or_catalog_with_locale"
      : "object_or_catalog";
  }
  if (isAliasOrEditionRole(observation.role)) return "alias_or_edition";
  if (localeHint) return "locale_hint";
  return "listing_or_user";
}

function titleCleanliness(value: string): TitleCleanliness {
  const trimmed = value.trim();
  return {
    punctuationCount: (trimmed.match(/[^\p{L}\p{N}\s]/gu) || []).length,
    tokenCount: trimmed.split(/\s+/).filter(Boolean).length,
    length: trimmed.length,
  };
}

function compareTitleCleanliness(a: TitleCleanliness, b: TitleCleanliness): number {
  if (a.punctuationCount !== b.punctuationCount) {
    return a.punctuationCount - b.punctuationCount;
  }
  if (a.tokenCount !== b.tokenCount) {
    return a.tokenCount - b.tokenCount;
  }
  return a.length - b.length;
}

function compareCandidatePriority(
  a: RankedObservationTitle,
  b: RankedObservationTitle,
): number {
  const tierDiff = tierRank(a.tier) - tierRank(b.tier);
  if (tierDiff !== 0) return tierDiff;
  if (a.evidenceRank !== b.evidenceRank) return b.evidenceRank - a.evidenceRank;
  const cleanlinessDiff = compareTitleCleanliness(a.cleanliness, b.cleanliness);
  if (cleanlinessDiff !== 0) return cleanlinessDiff;
  return a.value.localeCompare(b.value, "en");
}

function consensusScoreForTitle(value: string, pool: string[]): number {
  if (pool.length === 0) return 0;
  const sum = pool.reduce(
    (acc, candidate) => acc + metadataTitleSimilarity(value, candidate),
    0,
  );
  return sum / pool.length;
}

function observationTitlesFromMetadata(
  metadata: MetadataResult,
): RankedObservationTitle[] {
  if (!metadata.observations?.length) return [];
  if (
    metadata.observationSchemaVersion &&
    metadata.observationSchemaVersion !== METADATA_OBSERVATION_SCHEMA_VERSION
  ) {
    return [];
  }

  const ranked: RankedObservationTitle[] = [];
  for (const observation of metadata.observations) {
    if (observation.kind !== "title") continue;
    if (!isDisplayObservation(observation)) continue;
    if (isRejectedObservation(observation)) continue;

    const value = observation.value?.trim();
    if (!value) continue;

    ranked.push({
      key: normalizeTitleKey(value),
      value,
      tier: titleObservationTier(observation),
      evidenceRank: observationEvidenceRank(observation.usage.evidence),
      cleanliness: titleCleanliness(value),
    });
  }

  return ranked;
}

function metadataObservationsFromResults(
  resultsByWeight: ProviderMetadataInput[],
): MetadataObservation[] {
  return resultsByWeight.flatMap(({ metadata }) => {
    if (!metadata.observations?.length) return [];
    if (
      metadata.observationSchemaVersion &&
      metadata.observationSchemaVersion !== METADATA_OBSERVATION_SCHEMA_VERSION
    ) {
      return [];
    }
    return metadata.observations;
  });
}

function pickBestMetadataObservationImageUrl(
  resultsByWeight: ProviderMetadataInput[],
): string | undefined {
  const observations = metadataObservationsFromResults(resultsByWeight);
  if (observations.length === 0) return undefined;
  return (
    pickCoverUrlFromObservations(observations, coverUrlQualityRank) ?? undefined
  );
}

function factObservationToMetadataFact(
  observation: FactObservation,
): MetadataFact {
  return {
    kind: observation.factKind,
    label: observation.label,
    value: observation.value,
    unit: observation.unit ?? undefined,
    url: observation.url ?? undefined,
    source: observation.provenance.providerId,
    priority: factObservationRankScore(observation),
  };
}

export function pickBestMetadataFactsFromObservations(
  resultsByWeight: ProviderMetadataInput[],
): MetadataFact[] {
  return pickBestFactObservationsByGroup(
    metadataObservationsFromResults(resultsByWeight),
  ).map(factObservationToMetadataFact);
}

function pickBestMetadataObservationTitle(
  resultsByWeight: ProviderMetadataInput[],
): string | undefined {
  const rawCandidates = resultsByWeight.flatMap(({ metadata }) =>
    observationTitlesFromMetadata(metadata),
  );
  if (rawCandidates.length === 0) return undefined;

  const byKey = new Map<string, AggregatedObservationTitle>();
  for (const candidate of rawCandidates) {
    const previous = byKey.get(candidate.key);
    if (!previous) {
      byKey.set(candidate.key, {
        ...candidate,
        mentions: 1,
      });
      continue;
    }

    const preferred =
      compareCandidatePriority(candidate, previous) < 0 ? candidate : previous;
    byKey.set(candidate.key, {
      ...preferred,
      mentions: previous.mentions + 1,
    });
  }

  const aggregates = Array.from(byKey.values());
  const bestTierRank = Math.min(...aggregates.map((entry) => tierRank(entry.tier)));
  const tierCandidates = aggregates.filter(
    (entry) => tierRank(entry.tier) === bestTierRank,
  );
  const consensusPool = rawCandidates
    .filter((entry) => tierRank(entry.tier) === bestTierRank)
    .map((entry) => entry.value);

  if (tierCandidates.length === 0) return undefined;

  return tierCandidates
    .slice()
    .sort((a, b) => {
      const consensusA = consensusScoreForTitle(a.value, consensusPool);
      const consensusB = consensusScoreForTitle(b.value, consensusPool);
      if (consensusA !== consensusB) return consensusB - consensusA;

      if (a.mentions !== b.mentions) return b.mentions - a.mentions;
      if (a.evidenceRank !== b.evidenceRank) return b.evidenceRank - a.evidenceRank;

      const cleanlinessDiff = compareTitleCleanliness(
        a.cleanliness,
        b.cleanliness,
      );
      if (cleanlinessDiff !== 0) return cleanlinessDiff;

      if (a.value.length !== b.value.length) return a.value.length - b.value.length;
      return a.value.localeCompare(b.value, "en");
    })[0]
    ?.value;
}

function dedupePeople(
  people: Array<{ name: string; imageUrl?: string | null }>,
): Array<{ name: string; imageUrl?: string | null }> | undefined {
  if (people.length === 0) return undefined;
  const byName = new Map<string, { name: string; imageUrl?: string | null }>();
  for (const person of people) {
    const key = person.name.trim().toLowerCase();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, person);
      continue;
    }
    if (!existing.imageUrl && person.imageUrl) {
      byName.set(key, { name: existing.name, imageUrl: person.imageUrl });
    }
  }
  const merged = Array.from(byName.values());
  return merged.length > 0 ? merged : undefined;
}


export function preferRequestedDisplayTitle(
  metadata: MetadataResult,
  requestedName: string,
): MetadataResult {
  const currentTitle = metadata.title;
  const requestedTitle = requestedName.trim();

  if (
    !currentTitle ||
    !requestedTitle ||
    currentTitle.toLowerCase().trim() === requestedTitle.toLowerCase().trim()
  ) {
    return metadata;
  }

  if (!isMetadataTitleAligned({ title: currentTitle }, [requestedTitle], 0.58)) {
    return {
      ...metadata,
      title: requestedTitle,
      aliases: promoteTitleKeepingAliases(metadata, requestedTitle),
    };
  }

  if (
    scoreMetadataDisplayTitle(requestedTitle) <
      scoreMetadataDisplayTitle(currentTitle) &&
    !requestedTitleCoversCurrentTitle(requestedTitle, currentTitle)
  ) {
    return metadata;
  }

  return {
    ...metadata,
    title: requestedTitle,
    aliases: promoteTitleKeepingAliases(metadata, requestedTitle),
    fieldEvidence: dedupeFieldEvidence([
      ...(metadata.fieldEvidence || []),
      {
        field: "title",
        source: "RequestedDisplayTitle",
        value: requestedTitle,
        confidence: 0.62,
        priority: 180,
        rawValue: {
          previousTitle: currentTitle,
          reason: "preferred localized/requested display title",
        },
      },
    ]),
  };
}

export interface ProviderMetadataInput {
  providerId: string;
  metadata: MetadataResult;
}

function metadataHasCover(metadata: MetadataResult): boolean {
  return Boolean(
    metadata.imageUrl ||
      metadata.attachments?.some((attachment) => attachment.type === "cover"),
  );
}

function bookCoverPriorityFor(providerId: string) {
  return PROVIDERS.find((provider) => provider.id === providerId)
    ?.bookCoverPriority;
}

function withoutSecondaryBookCoverSources(
  mediaType: MediaType,
  results: ProviderMetadataInput[],
): ProviderMetadataInput[] {
  if (mediaType !== "books") return results;

  const hasPrimaryBookCover = results.some(
    (result) =>
      bookCoverPriorityFor(result.providerId) === "primary" &&
      metadataHasCover(result.metadata),
  );
  if (!hasPrimaryBookCover) return results;

  return results.map((result) => {
    if (bookCoverPriorityFor(result.providerId) !== "secondary") return result;
    const { imageUrl: _imageUrl, attachments, ...rest } = result.metadata;
    const filteredAttachments = attachments?.map((attachment) =>
      attachment.type === "cover"
        ? { ...attachment, type: "image" as const }
        : attachment,
    );
    return {
      ...result,
      metadata: {
        ...rest,
        imageUrl: undefined,
        attachments:
          filteredAttachments && filteredAttachments.length > 0
            ? filteredAttachments
            : undefined,
      },
    };
  });
}

export function mergeMetadata(
  mediaType: MediaType,
  results: ProviderMetadataInput[],
  options: {
    includePcSources?: boolean;
    requestedPlatformKey?: string | null;
    requestedTitle?: string | null;
  } = {},
): MetadataResult {
  const activeResults = withoutSecondaryBookCoverSources(
    mediaType,
    results.filter((r) => r.metadata),
  );
  if (activeResults.length === 0) return {};

  const resultsByWeight = [...activeResults].sort((a, b) => {
    const providerA = PROVIDERS.find((p) => p.id === a.providerId);
    const providerB = PROVIDERS.find((p) => p.id === b.providerId);
    const weightA = providerA?.weight ?? 0.5;
    const weightB = providerB?.weight ?? 0.5;
    return weightB - weightA;
  });

  const titleSources = resultsByWeight.map((r) => r.metadata);
  const observedTitle = pickBestMetadataObservationTitle(resultsByWeight);
  const title =
    observedTitle ||
    pickBestRegionalTitle(titleSources) ||
    pickBestMetadataTitle(titleSources.map((source) => source.title));

  const descriptionCandidates = resultsByWeight.flatMap((r) => {
    const text = r.metadata.description;
    if (!text?.trim()) return [];
    if (
      mediaType === "games" &&
      options.requestedTitle &&
      !descriptionMatchesRequestedTitle(options.requestedTitle, text)
    ) {
      return [];
    }
    const provider = PROVIDERS.find((p) => p.id === r.providerId);
    return [{
      text,
      language: provider?.defaultLanguage === "fr" ? "fr" : undefined,
      source: r.providerId,
    }];
  });
  const description = pickBestLocalizedDescription(descriptionCandidates);

  const releaseDate = resultsByWeight.find((r) => r.metadata.releaseDate)?.metadata.releaseDate;

  const barcodeCandidates =
    options.requestedTitle?.trim() && mediaType === "games"
      ? resultsByWeight.filter(
          (r) =>
            r.metadata.barcode &&
            r.metadata.title &&
            isMetadataTitleAligned(
              { title: r.metadata.title },
              [options.requestedTitle!.trim()],
              0.58,
            ),
        )
      : resultsByWeight;
  const barcode = pickDiscoveredBarcode(
    barcodeCandidates.map((r) => r.metadata.barcode),
  );

  const allAuthors = resultsByWeight.flatMap((r) => r.metadata.authors || []);
  const authors = allAuthors.length > 0 ? dedupePeople(allAuthors) : undefined;

  const allPublishers = resultsByWeight.flatMap((r) => r.metadata.publishers || []);
  const publishers = allPublishers.length > 0 ? dedupePeople(allPublishers) : undefined;

  const providerInfo = (providerId: string) =>
    PROVIDERS.find((p) => p.id === providerId);
  // Digital-storefront art (e.g. Steam PC capsules) misrepresents a physical
  // console scan, so drop it from the game cover set unless PC sources are asked
  // for. Trait-driven (provider-declared), not a hardcoded provider name.
  const excludesDigitalStorefrontArt = (providerId: string) =>
    Boolean(providerInfo(providerId)?.digitalStorefrontArt) &&
    mediaType === "games" &&
    !options.includePcSources;

  const allAttachments = resultsByWeight.flatMap((r) => {
    const attachments = r.metadata.attachments || [];
    if (excludesDigitalStorefrontArt(r.providerId)) {
      return [];
    }
    return attachments.map((a) =>
      withProviderAttachmentTraits({
        ...a,
        source: a.source || r.providerId,
      }),
    );
  });

  const providerImageCandidates = resultsByWeight.flatMap((r) => {
    if (!r.metadata.imageUrl) return [];
    if (excludesDigitalStorefrontArt(r.providerId)) {
      return [];
    }
    const matchingAttachment = r.metadata.attachments?.find(
      (attachment) => attachment.url === r.metadata.imageUrl,
    );
    return [
      withProviderAttachmentTraits({
        type: matchingAttachment?.type ?? ("cover" as AttachmentType),
        url: r.metadata.imageUrl,
        role: matchingAttachment?.role,
        source: matchingAttachment?.source || r.providerId,
        title: matchingAttachment?.title,
      }),
    ];
  });

  const displayScoreOptions = {
    requestedPlatformKey: options.requestedPlatformKey,
  };

  const combined = [...allAttachments, ...providerImageCandidates];
  const rankedCovers = rankCoverGalleryAttachments(
    combined,
    undefined,
    displayScoreOptions,
  );
  const rankedCoverUrls = new Set(
    rankedCovers.map((attachment) => attachment.url).filter(Boolean),
  );
  const trailing = combined.filter(
    (attachment) => attachment.url && !rankedCoverUrls.has(attachment.url),
  );
  const attachments = [...rankedCovers, ...trailing];

  const highestWeightResultWithImage = resultsByWeight.find((r) => r.metadata.imageUrl);
  const observedImageUrl = pickBestMetadataObservationImageUrl(resultsByWeight);
  // A provider whose cover is canonical for its media type (e.g. Discogs album
  // art) is trusted as-is when it leads, rather than re-ranked.
  const imageUrl =
    highestWeightResultWithImage &&
    providerInfo(highestWeightResultWithImage.providerId)?.canonicalCover
      ? highestWeightResultWithImage.metadata.imageUrl
      : (observedImageUrl ??
        (pickBestCoverFromAttachments(
          combined,
          undefined,
          displayScoreOptions,
        ) || pickBestDisplayImageUrl(combined)));

  const duration = resultsByWeight.find((r) => r.metadata.duration !== undefined)?.metadata.duration;
  const pageCount = resultsByWeight.find((r) => r.metadata.pageCount !== undefined)?.metadata.pageCount;
  const tracksCount = resultsByWeight.find((r) => r.metadata.tracksCount !== undefined)?.metadata.tracksCount;

  const rawFacts = resultsByWeight.flatMap((r) => r.metadata.facts || []);
  const observedFacts = pickBestMetadataFactsFromObservations(resultsByWeight);
  let finalFacts =
    observedFacts.length > 0 ? [...observedFacts, ...rawFacts] : rawFacts;
  const hasTimeToBeat = finalFacts.some((f) => f.kind === "time-to-beat");
  if (hasTimeToBeat) {
    finalFacts = finalFacts.filter((f) => f.kind !== "duration");
  }
  const facts = finalFacts.length > 0 ? dedupeFacts(finalFacts) : undefined;

  const aliases = collectMergedSearchAliases(
    resultsByWeight.map((r) => r.metadata),
    title ?? "",
  );

  const externalIdsList = resultsByWeight.map((r) => r.metadata.externalIds).filter(Boolean);
  const externalIds = externalIdsList.length > 0
    ? externalIdsList.reduce<Record<string, string | null | undefined>>((acc, curr) => {
        for (const [key, val] of Object.entries(curr!)) {
          if (val && !acc[key]) {
            acc[key] = val;
          }
        }
        return acc;
      }, {})
    : undefined;

  const platformKey =
    resultsByWeight.find((r) => r.metadata.platformKey)?.metadata.platformKey ??
    options.requestedPlatformKey ??
    undefined;

  return {
    title,
    description,
    releaseDate,
    barcode,
    authors,
    publishers,
    duration,
    pageCount,
    tracksCount,
    platformKey,
    imageUrl,
    attachments: attachments.length > 0 ? attachments : undefined,
    aliases,
    facts: facts && facts.length > 0 ? facts : undefined,
    externalIds,
  };
}
