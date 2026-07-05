import {
  isDisplayObservation,
  isRejectedObservation,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationEvidenceRank,
} from "@/lib/metadata/observations";
import { scoreMetadataDisplayTitle } from "@/lib/title/displayScore";
import { metadataTitleSimilarity } from "@/lib/metadata/titleMatching";
import {
  factObservationRankScore,
  pickBestFactObservationsByGroup,
  pickCoverUrlFromObservations,
} from "@/lib/barcode/evidence/ranking";
import { coverUrlQualityRank } from "@/services/provider/catalog";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type {
  TitleObservation,
  TitleObservationRole,
  FactObservation,
  MetadataObservation,
} from "@/types/metadataObservation";

/**
 * Observation-based projection ranking for the merge engine: pick the best
 * display title, facts and cover image from typed provider observations
 * (role + locale tiers, cross-source consensus, cleanliness). Split out of
 * merge.ts; pure/leaf logic, no call back into mergeMetadata (no cycle).
 */

export interface ProviderMetadataInput {
  providerId: string;
  metadata: MetadataResult;
}

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
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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

function titleObservationTier(
  observation: TitleObservation,
): ObservationTitleTier {
  const localeHint = hasLocaleHint(observation);
  if (isObjectOrCatalogRole(observation.role)) {
    return localeHint ? "object_or_catalog_with_locale" : "object_or_catalog";
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

function compareTitleCleanliness(
  a: TitleCleanliness,
  b: TitleCleanliness,
): number {
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
  results: ProviderMetadataInput[],
): MetadataObservation[] {
  return results.flatMap(({ metadata }) => {
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

function bestProviderObservationRank(input: ProviderMetadataInput): {
  tierRank: number;
  evidenceRank: number;
} {
  const observations = metadataObservationsFromResults([input]);
  const titleObservations = observations.filter(
    (row): row is TitleObservation => row.kind === "title",
  );
  if (titleObservations.length === 0) {
    return {
      tierRank: OBSERVATION_TITLE_TIER_ORDER.length,
      evidenceRank: 0,
    };
  }

  let bestTierRank = OBSERVATION_TITLE_TIER_ORDER.length;
  let bestEvidenceRank = 0;
  for (const observation of titleObservations) {
    const candidateTierRank = tierRank(titleObservationTier(observation));
    const candidateEvidenceRank = observationEvidenceRank(
      observation.usage.evidence,
    );
    if (
      candidateTierRank < bestTierRank ||
      (candidateTierRank === bestTierRank &&
        candidateEvidenceRank > bestEvidenceRank)
    ) {
      bestTierRank = candidateTierRank;
      bestEvidenceRank = candidateEvidenceRank;
    }
  }
  return { tierRank: bestTierRank, evidenceRank: bestEvidenceRank };
}

/** Provider-neutral pre-order for merge tie-breaks (replaces per-provider weight). */
function orderResultsByObservationStrength(
  results: ProviderMetadataInput[],
): ProviderMetadataInput[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const rankA = bestProviderObservationRank(a.result);
      const rankB = bestProviderObservationRank(b.result);
      if (rankA.tierRank !== rankB.tierRank) {
        return rankA.tierRank - rankB.tierRank;
      }
      if (rankA.evidenceRank !== rankB.evidenceRank) {
        return rankB.evidenceRank - rankA.evidenceRank;
      }
      return a.index - b.index;
    })
    .map(({ result }) => result);
}

function pickBestMetadataObservationImageUrl(
  results: ProviderMetadataInput[],
): string | undefined {
  const observations = metadataObservationsFromResults(results);
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
  results: ProviderMetadataInput[],
): MetadataFact[] {
  return pickBestFactObservationsByGroup(
    metadataObservationsFromResults(results),
  ).map(factObservationToMetadataFact);
}

function pickBestMetadataObservationTitle(
  results: ProviderMetadataInput[],
): string | undefined {
  const rawCandidates = results.flatMap(({ metadata }) =>
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
  const bestTierRank = Math.min(
    ...aggregates.map((entry) => tierRank(entry.tier)),
  );
  const tierCandidates = aggregates.filter(
    (entry) => tierRank(entry.tier) === bestTierRank,
  );
  const consensusPool = rawCandidates
    .filter((entry) => tierRank(entry.tier) === bestTierRank)
    .map((entry) => entry.value);

  if (tierCandidates.length === 0) return undefined;

  return tierCandidates.slice().sort((a, b) => {
    const consensusA = consensusScoreForTitle(a.value, consensusPool);
    const consensusB = consensusScoreForTitle(b.value, consensusPool);
    if (consensusA !== consensusB) return consensusB - consensusA;

    if (a.mentions !== b.mentions) return b.mentions - a.mentions;
    if (a.evidenceRank !== b.evidenceRank)
      return b.evidenceRank - a.evidenceRank;

    const cleanlinessDiff = compareTitleCleanliness(
      a.cleanliness,
      b.cleanliness,
    );
    if (cleanlinessDiff !== 0) return cleanlinessDiff;

    if (a.value.length !== b.value.length)
      return a.value.length - b.value.length;
    return a.value.localeCompare(b.value, "en");
  })[0]?.value;
}

export {
  orderResultsByObservationStrength,
  pickBestMetadataObservationTitle,
  pickBestMetadataObservationImageUrl,
};
