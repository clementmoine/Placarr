import {
  isDisplayObservation,
  isRejectedObservation,
  observationEvidenceRank,
} from "@/lib/metadata/observations";
import type {
  FactObservation,
  ImageObservation,
  MetadataObservation,
  TitleObservation,
} from "@/types/metadataObservation";

export const TITLE_ROLE_TIER: Record<TitleObservation["role"], number> = {
  object_title: 3,
  catalog_title: 2,
  edition_title: 2,
  alias_title: 2,
  listing_title: 1,
  user_input_title: 1,
};

export const IMAGE_ROLE_TIER: Record<ImageObservation["role"], number> = {
  cover_front: 3,
  product_packshot: 2,
  cover_back: 2,
  background: 1,
  screenshot: 1,
  logo: 1,
  gallery_image: 1,
  listing_photo: 0,
  user_photo: 0,
};

export const FACT_ROLE_TIER: Record<FactObservation["role"], number> = {
  structured_fact: 3,
  listing_fact: 1,
  inferred_fact: 0,
  user_fact: 2,
};

const OBSERVATION_TIER_MULTIPLIER = 100;

export function titleObservationRankScore(
  observation: TitleObservation,
): number {
  return (
    TITLE_ROLE_TIER[observation.role] * OBSERVATION_TIER_MULTIPLIER +
    observationEvidenceRank(observation.usage.evidence) +
    (observation.usage.displayCandidate ? 5 : 0)
  );
}

export function imageObservationRankScore(
  observation: ImageObservation,
): number {
  return (
    IMAGE_ROLE_TIER[observation.role] * OBSERVATION_TIER_MULTIPLIER +
    observationEvidenceRank(observation.usage.evidence) +
    (observation.usage.displayCandidate ? 5 : 0)
  );
}

export function factObservationRankScore(observation: FactObservation): number {
  return (
    FACT_ROLE_TIER[observation.role] * OBSERVATION_TIER_MULTIPLIER +
    observationEvidenceRank(observation.usage.evidence)
  );
}

export function compareTitleObservations(
  a: TitleObservation,
  b: TitleObservation,
): number {
  return titleObservationRankScore(b) - titleObservationRankScore(a);
}

export function compareImageObservations(
  a: ImageObservation,
  b: ImageObservation,
): number {
  return imageObservationRankScore(b) - imageObservationRankScore(a);
}

export function compareFactObservations(
  a: FactObservation,
  b: FactObservation,
): number {
  return factObservationRankScore(b) - factObservationRankScore(a);
}

export function titleObservationsFromList(
  observations: MetadataObservation[],
): TitleObservation[] {
  return observations.filter(
    (row): row is TitleObservation =>
      row.kind === "title" && !isRejectedObservation(row),
  );
}

export function imageObservationsFromList(
  observations: MetadataObservation[],
): ImageObservation[] {
  return observations.filter(
    (row): row is ImageObservation =>
      row.kind === "image" && !isRejectedObservation(row),
  );
}

export function factObservationsFromList(
  observations: MetadataObservation[],
): FactObservation[] {
  return observations.filter(
    (row): row is FactObservation =>
      row.kind === "fact" && !isRejectedObservation(row),
  );
}

export function pickDisplayTitleFromObservations(
  observations: MetadataObservation[],
): string | null {
  const titles = titleObservationsFromList(observations);
  if (titles.length === 0) return null;

  const ranked = titles.slice().sort(compareTitleObservations);
  const preferred =
    ranked.find(isDisplayObservation) ??
    ranked.find((row) => row.usage.evidence !== "weak") ??
    ranked[0];
  const value = preferred?.value.trim();
  return value || null;
}

export function pickCoverUrlFromObservations(
  observations: MetadataObservation[],
  urlQualityRank: (url: string) => number = () => 0,
): string | null {
  const images = imageObservationsFromList(observations).filter((row) =>
    row.url.trim(),
  );
  if (images.length === 0) return null;

  const ranked = images.slice().sort((a, b) => {
    const scoreDiff = compareImageObservations(a, b);
    if (scoreDiff !== 0) return scoreDiff;
    return urlQualityRank(b.url) - urlQualityRank(a.url);
  });

  const preferred =
    ranked.find(isDisplayObservation) ??
    ranked.find((row) => row.role === "cover_front") ??
    ranked[0];
  return preferred?.url.trim() || null;
}

export function rankFactObservations(
  observations: MetadataObservation[],
): FactObservation[] {
  return factObservationsFromList(observations).sort(compareFactObservations);
}

export function factObservationGroupKey(observation: FactObservation): string {
  if (observation.factKind === "age-rating") {
    return `${observation.factKind}:${observation.label}`.toLowerCase();
  }
  return observation.factKind.toLowerCase();
}

export function pickBestFactObservationsByGroup(
  observations: MetadataObservation[],
): FactObservation[] {
  const ranked = rankFactObservations(observations);
  const byGroup = new Map<string, FactObservation>();
  for (const observation of ranked) {
    const key = factObservationGroupKey(observation);
    if (!byGroup.has(key)) {
      byGroup.set(key, observation);
    }
  }
  return Array.from(byGroup.values()).sort(compareFactObservations);
}

export function pickBarcodeFieldValuesFromObservations(
  observations: MetadataObservation[],
): {
  platformKey: string | null;
  mediaFormat: string | null;
  players: string | null;
  playtime: string | null;
  ageRating: string | null;
} {
  const picks = pickBestFactObservationsByGroup(observations);
  const valueFor = (kind: string) =>
    picks.find((row) => row.factKind === kind)?.value ?? null;
  const ageRatingFact = picks.find((row) => row.factKind === "age-rating");

  return {
    platformKey: valueFor("platform"),
    mediaFormat: valueFor("media-format"),
    players: valueFor("players"),
    playtime: valueFor("playtime"),
    ageRating: ageRatingFact
      ? ageRatingFact.label === "PEGI"
        ? `PEGI ${ageRatingFact.value}`
        : ageRatingFact.value
      : null,
  };
}
