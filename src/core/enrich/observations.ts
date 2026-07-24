import type {
  AliasObservationRole,
  FactObservationRole,
  ImageObservationRole,
  MetadataObservation,
  MetadataObservationKind,
  MetadataObservationProvenance,
  MetadataObservationUsage,
  ObservationEvidenceStrength,
  ObservationEvidenceSignal,
  ObservationSourceDocumentRole,
  TitleObservationRole,
} from "@/types/metadataObservation";
import type { MetadataResult } from "@/types/metadataProvider";

export const METADATA_OBSERVATION_SCHEMA_VERSION =
  "metadata-observations/v1" as const;

export function assertNeverObservation(value: never): never {
  throw new Error(`Unhandled metadata observation: ${JSON.stringify(value)}`);
}

export function observationKind(
  observation: MetadataObservation,
): MetadataObservationKind {
  switch (observation.kind) {
    case "title":
    case "image":
    case "fact":
    case "alias":
    case "offer":
    case "external-id":
      return observation.kind;
    default:
      return assertNeverObservation(observation);
  }
}

export function isDisplayObservation(
  observation: MetadataObservation,
): boolean {
  return observation.usage.displayCandidate;
}

export function isSearchableObservation(
  observation: MetadataObservation,
): boolean {
  return observation.usage.searchAlias !== "none";
}

export function isRejectedObservation(
  observation: MetadataObservation,
): boolean {
  return observation.usage.evidence === "reject";
}

export function shouldRetainObservation(
  observation: MetadataObservation,
): boolean {
  return observation.usage.retainForReprojection;
}

export function observationEvidenceRank(
  strength: ObservationEvidenceStrength,
): number {
  switch (strength) {
    case "reject":
      return -1;
    case "weak":
      return 1;
    case "normal":
      return 2;
    case "strong":
      return 3;
    default:
      return assertNeverObservation(strength);
  }
}

export function makeObservationUsage(
  overrides: Partial<MetadataObservationUsage> = {},
): MetadataObservationUsage {
  return {
    displayCandidate: false,
    searchAlias: "none",
    evidence: "weak",
    retainForReprojection: true,
    ...overrides,
  };
}

export interface MetadataResultObservationOptions {
  providerId: string;
  providerLabel?: string;
  sourceDocumentRole: ObservationSourceDocumentRole;
  evidenceSignals: ObservationEvidenceSignal[];
  titleRole: TitleObservationRole;
  aliasRole: AliasObservationRole;
  imageRole: ImageObservationRole;
  factRole: FactObservationRole;
  externalIdRole?: "primary_id" | "cross_reference" | "provider_record_id";
  language?: string | "neutral" | "unknown";
  observedAt?: string;
  sourceUrl?: string | null;
  sourceId?: string | null;
}

function provenanceFromOptions(
  options: MetadataResultObservationOptions,
): MetadataObservationProvenance {
  return {
    providerId: options.providerId,
    providerLabel: options.providerLabel,
    sourceDocumentRole: options.sourceDocumentRole,
    sourceUrl: options.sourceUrl,
    sourceId: options.sourceId,
    observedAt: options.observedAt,
    evidenceSignals: options.evidenceSignals,
  };
}

function usageForTitleRole(
  role: TitleObservationRole,
): MetadataObservationUsage {
  switch (role) {
    case "object_title":
    case "catalog_title":
      return makeObservationUsage({
        displayCandidate: true,
        searchAlias: "strong",
        evidence: "strong",
      });
    case "edition_title":
    case "alias_title":
      return makeObservationUsage({
        displayCandidate: true,
        searchAlias: "normal",
        evidence: "normal",
      });
    case "listing_title":
    case "user_input_title":
      return makeObservationUsage({
        displayCandidate: false,
        searchAlias: "weak",
        evidence: "weak",
      });
    default:
      return assertNeverObservation(role);
  }
}

function usageForImageRole(
  role: ImageObservationRole,
): MetadataObservationUsage {
  switch (role) {
    case "cover_front":
    case "cover_back":
    case "product_packshot":
    case "background":
    case "screenshot":
    case "logo":
    case "gallery_image":
      return makeObservationUsage({
        displayCandidate: true,
        evidence: "normal",
      });
    case "listing_photo":
    case "user_photo":
      return makeObservationUsage({
        displayCandidate: false,
        evidence: "weak",
      });
    default:
      return assertNeverObservation(role);
  }
}

function usageForAliasRole(
  role: AliasObservationRole,
): MetadataObservationUsage {
  switch (role) {
    case "provider_grouped_alias":
    case "regional_alias":
      return makeObservationUsage({
        searchAlias: "strong",
        evidence: "strong",
      });
    case "edition_alias":
      return makeObservationUsage({
        searchAlias: "normal",
        evidence: "normal",
      });
    case "listing_alias":
    case "user_alias":
      return makeObservationUsage({
        searchAlias: "weak",
        evidence: "weak",
      });
    default:
      return assertNeverObservation(role);
  }
}

export function observationsFromMetadataResult(
  metadata: MetadataResult,
  options: MetadataResultObservationOptions,
): MetadataObservation[] {
  const provenance = provenanceFromOptions(options);
  const observations: MetadataObservation[] = [];

  if (metadata.title) {
    observations.push({
      kind: "title",
      role: options.titleRole,
      value: metadata.title,
      language: options.language,
      provenance,
      usage: usageForTitleRole(options.titleRole),
    });
  }

  for (const regionalTitle of metadata.regionalTitles || []) {
    observations.push({
      kind: "title",
      role: options.titleRole,
      value: regionalTitle.text,
      region: regionalTitle.region ?? null,
      provenance,
      usage: usageForTitleRole(options.titleRole),
    });
  }

  for (const alias of metadata.aliases || []) {
    observations.push({
      kind: "alias",
      role: options.aliasRole,
      value: alias,
      language: options.language,
      provenance,
      usage: usageForAliasRole(options.aliasRole),
    });
  }

  if (metadata.imageUrl) {
    observations.push({
      kind: "image",
      role: options.imageRole,
      type: "cover",
      url: metadata.imageUrl,
      language: options.language,
      provenance,
      usage: usageForImageRole(options.imageRole),
    });
  }

  for (const attachment of metadata.attachments || []) {
    observations.push({
      kind: "image",
      role: options.imageRole,
      type: attachment.type,
      url: attachment.url,
      title: attachment.title ?? null,
      language: options.language,
      region: attachment.role ?? null,
      provenance: {
        ...provenance,
        providerId: attachment.source || provenance.providerId,
      },
      usage: usageForImageRole(options.imageRole),
    });
  }

  for (const fact of metadata.facts || []) {
    observations.push({
      kind: "fact",
      role: options.factRole,
      factKind: fact.kind,
      label: fact.label,
      value: fact.value,
      unit: fact.unit ?? null,
      url: fact.url ?? null,
      provenance: {
        ...provenance,
        providerId: fact.source || provenance.providerId,
      },
      usage: makeObservationUsage({
        evidence: options.factRole === "structured_fact" ? "strong" : "normal",
      }),
    });
  }

  for (const [idKind, value] of Object.entries(metadata.externalIds || {})) {
    if (!value) continue;
    observations.push({
      kind: "external-id",
      role: options.externalIdRole ?? "cross_reference",
      idKind,
      value,
      provenance,
      usage: makeObservationUsage({ evidence: "strong" }),
    });
  }

  return observations;
}
