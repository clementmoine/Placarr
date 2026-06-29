import { makeObservationUsage } from "@/lib/metadata/observations";
import { coverUrlQualityRank } from "@/services/provider/registry";
import {
  providerDisplayLabelForEvidenceLabel,
  providerIdForEvidenceLabel,
} from "@/services/provider/evidence";
import type {
  FactObservationRole,
  ImageObservationRole,
  MetadataObservation,
  ObservationEvidenceSignal,
  ObservationSourceDocumentRole,
  TitleObservation,
  TitleObservationRole,
} from "@/types/metadataObservation";

import { pickPlatformKeyFromSignals } from "@/lib/barcode/gameLookup";

import {
  imageObservationRankScore,
  titleObservationRankScore,
} from "./ranking";
import {
  barcodeEvidenceRankScore,
  barcodeEvidenceTier,
  CLUSTER_CONFIDENCE,
  OBSERVATION_RANK_SOURCE_WEIGHT_SCALE,
  OBSERVATION_ROLE_CLUSTER_WEIGHT,
} from "./scoring";
import type { ProductEvidence } from "./types";

export {
  compareFactObservations,
  compareImageObservations,
  compareTitleObservations,
  factObservationRankScore,
  imageObservationRankScore,
  pickCoverUrlFromObservations,
  pickDisplayTitleFromObservations,
  rankFactObservations,
  titleObservationRankScore,
} from "./ranking";

export {
  barcodeClusterSourceScore,
  barcodeEvidenceRankScore,
  barcodeEvidenceTier,
  TIER_RANK_MULTIPLIER,
} from "./scoring";

export function compareBarcodeEvidenceByRank(
  a: ProductEvidence,
  b: ProductEvidence,
): number {
  return barcodeEvidenceRankScore(b) - barcodeEvidenceRankScore(a);
}

/** P2: provider-neutral rank derived from projected title observations. */
export function barcodeEvidenceTitleObservationScore(
  evidence: ProductEvidence,
): number {
  const titleObservation = observationsFromProductEvidence(evidence).find(
    (row) => row.kind === "title",
  );
  if (!titleObservation || titleObservation.kind !== "title") {
    return barcodeEvidenceRankScore(evidence);
  }

  return (
    titleObservationRankScore(titleObservation) +
    barcodeEvidenceObservationSourceWeight(evidence) *
      OBSERVATION_RANK_SOURCE_WEIGHT_SCALE
  );
}

/** P2: provider-neutral image rank for cover selection within a cluster. */
export function barcodeEvidenceImageObservationScore(
  evidence: ProductEvidence,
): number {
  const imageObservation = observationsFromProductEvidence(evidence).find(
    (row) => row.kind === "image",
  );
  if (!imageObservation || imageObservation.kind !== "image") {
    return evidence.coverUrl
      ? barcodeEvidenceObservationSourceWeight(evidence) *
          OBSERVATION_RANK_SOURCE_WEIGHT_SCALE
      : 0;
  }

  return (
    imageObservationRankScore(imageObservation) +
    (evidence.coverUrl ? coverUrlQualityRank(evidence.coverUrl) / 100 : 0) +
    barcodeEvidenceObservationSourceWeight(evidence) *
      OBSERVATION_RANK_SOURCE_WEIGHT_SCALE
  );
}

export function compareBarcodeEvidenceByImageObservationRank(
  a: ProductEvidence,
  b: ProductEvidence,
): number {
  return (
    barcodeEvidenceImageObservationScore(b) -
    barcodeEvidenceImageObservationScore(a)
  );
}

export function compareBarcodeEvidenceByObservationRank(
  a: ProductEvidence,
  b: ProductEvidence,
): number {
  return (
    barcodeEvidenceTitleObservationScore(b) -
    barcodeEvidenceTitleObservationScore(a)
  );
}

/** Maps title/image observations to the legacy `sourceWeight` scale (~0.05–0.45). */
function titleObservationMatchesEvidenceTier(
  evidence: ProductEvidence,
  observation: TitleObservation,
): boolean {
  switch (observation.role) {
    case "object_title":
      return evidence.isCanonical;
    case "catalog_title":
      return evidence.isTrustedRetailer && !evidence.isCanonical;
    case "listing_title":
      return !evidence.isCanonical && !evidence.isTrustedRetailer;
    default:
      return true;
  }
}

export function barcodeEvidenceObservationSourceWeight(
  evidence: ProductEvidence,
): number {
  const titleObservation = observationsFromProductEvidence(evidence).find(
    (row) => row.kind === "title",
  );
  if (!titleObservation || titleObservation.kind !== "title") {
    return evidence.sourceWeight;
  }

  if (titleObservationMatchesEvidenceTier(evidence, titleObservation)) {
    return evidence.sourceWeight;
  }

  const roleWeight =
    OBSERVATION_ROLE_CLUSTER_WEIGHT[titleObservation.role] ??
    OBSERVATION_ROLE_CLUSTER_WEIGHT.listing_title;
  return roleWeight * 0.85 + evidence.sourceWeight * 0.15;
}

/** Maps projected title observations to a cluster-confidence weight (~1–3.5). */
export function barcodeEvidenceObservationSupportWeight(
  evidence: ProductEvidence,
): number {
  return (
    barcodeEvidenceTier(evidence) +
    barcodeEvidenceObservationSourceWeight(evidence)
  );
}

/**
 * Per-row contribution to the cluster-confidence base score: the projected
 * observation source weight plus a small factual-tier nudge. Folding the tier in
 * here (instead of only via the per-provider anchor bonuses) lets a canonical row
 * lift the base more than a marketplace row, keeping the confidence number
 * faithful to the evidence tier while the tier scale stays well under a full
 * `sourceWeight` so it never flips a cluster winner on its own.
 */
export function barcodeClusterObservationContribution(
  evidence: ProductEvidence,
): number {
  return (
    barcodeEvidenceTier(evidence) * CLUSTER_CONFIDENCE.observationTierScale +
    barcodeEvidenceObservationSourceWeight(evidence)
  );
}

export function barcodeSourceDocumentRole(
  evidence: ProductEvidence,
): ObservationSourceDocumentRole {
  if (evidence.isCanonical) return "reference_record";
  if (evidence.isTrustedRetailer) return "catalog_product";
  return "marketplace_listing";
}

export function barcodeTitleRole(evidence: ProductEvidence): TitleObservationRole {
  if (evidence.isAlias) return "alias_title";
  if (evidence.isCanonical) return "object_title";
  if (evidence.isTrustedRetailer) return "catalog_title";
  return "listing_title";
}

export function barcodeImageRole(evidence: ProductEvidence): ImageObservationRole {
  if (evidence.isCanonical || evidence.isTrustedRetailer) {
    return "cover_front";
  }
  return "listing_photo";
}

function barcodeFactRole(evidence: ProductEvidence): FactObservationRole {
  if (evidence.isCanonical || evidence.isTrustedRetailer) {
    return "structured_fact";
  }
  return "listing_fact";
}

/** Maps one barcode evidence row to typed observations (P2 migration bridge). */
export function observationsFromProductEvidence(
  evidence: ProductEvidence,
): MetadataObservation[] {
  const provenance = {
    providerId: providerIdForEvidenceLabel(evidence.providerName),
    providerLabel: providerDisplayLabelForEvidenceLabel(evidence.providerName),
    sourceDocumentRole: barcodeSourceDocumentRole(evidence),
    evidenceSignals: ["barcode_match"] satisfies ObservationEvidenceSignal[],
  };

  const titleStrength = evidence.isCanonical
    ? "strong"
    : evidence.isTrustedRetailer
      ? "normal"
      : "weak";

  const observations: MetadataObservation[] = [
    {
      kind: "title",
      role: barcodeTitleRole(evidence),
      value: evidence.title,
      language: evidence.region?.toLowerCase() || "unknown",
      provenance,
      usage: makeObservationUsage({
        displayCandidate: evidence.isCanonical || evidence.isTrustedRetailer,
        searchAlias: titleStrength,
        evidence: titleStrength,
      }),
    },
  ];

  if (evidence.coverUrl) {
    observations.push({
      kind: "image",
      role: barcodeImageRole(evidence),
      type: "cover",
      url: evidence.coverUrl,
      provenance,
      usage: makeObservationUsage({
        displayCandidate: evidence.isCanonical || evidence.isTrustedRetailer,
        evidence: evidence.isCanonical ? "strong" : "weak",
      }),
    });
  }

  for (const fact of evidence.facts ?? []) {
    if (!fact.label?.trim() || !fact.value?.trim()) continue;
    const factStrength = evidence.isCanonical
      ? "strong"
      : evidence.isTrustedRetailer
        ? "normal"
        : "weak";
    observations.push({
      kind: "fact",
      role: barcodeFactRole(evidence),
      factKind: fact.kind,
      label: fact.label,
      value: fact.value,
      unit: fact.unit ?? null,
      provenance,
      usage: makeObservationUsage({
        evidence: factStrength,
      }),
    });
  }

  return observations;
}

export function observationsFromBarcodeEvidenceList(
  evidence: ProductEvidence[],
): MetadataObservation[] {
  return evidence.flatMap(observationsFromProductEvidence);
}

export function parseBarcodeCacheObservations(
  value: unknown,
): MetadataObservation[] {
  if (!Array.isArray(value)) return [];
  return value as MetadataObservation[];
}

export function pickPlatformKeyFromEvidence(
  evidence: ProductEvidence[],
): string | null {
  const signals = evidence.flatMap((item) => {
    const weight =
      barcodeEvidenceObservationSourceWeight(item) +
      (item.isCanonical ? 0.22 : 0);
    const platformValue =
      item.parsed.platformKey ??
      item.facts?.find((fact) => fact.kind === "platform")?.value?.trim();
    if (!platformValue) return [];

    return [{ value: platformValue, weight }];
  });

  return pickPlatformKeyFromSignals(
    signals.filter(
      (signal): signal is { value: string; weight: number } =>
        Boolean(signal.value?.trim()),
    ),
  );
}
