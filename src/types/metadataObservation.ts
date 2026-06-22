import type { AttachmentType } from "@prisma/client";

export type MetadataObservationKind =
  | "title"
  | "image"
  | "fact"
  | "alias"
  | "offer"
  | "external-id";

export type ObservationSourceDocumentRole =
  | "reference_record"
  | "catalog_product"
  | "marketplace_listing"
  | "offer"
  | "gallery"
  | "review"
  | "user_input"
  | "api_object"
  | "structured_data"
  | "unknown";

export type ObservationEvidenceSignal =
  | "barcode_match"
  | "external_id"
  | "structured_data"
  | "provider_grouped_alias"
  | "title_match"
  | "platform_match"
  | "type_match"
  | "same_provider_listing"
  | "user_supplied"
  | "explicit_mismatch";

export type ObservationEvidenceStrength =
  | "reject"
  | "weak"
  | "normal"
  | "strong";

export type ObservationSearchUsage = "none" | "weak" | "normal" | "strong";

export interface MetadataObservationUsage {
  displayCandidate: boolean;
  searchAlias: ObservationSearchUsage;
  evidence: ObservationEvidenceStrength;
  retainForReprojection: boolean;
}

export interface MetadataObservationProvenance {
  providerId: string;
  providerLabel?: string;
  sourceUrl?: string | null;
  sourceId?: string | null;
  sourceDocumentRole: ObservationSourceDocumentRole;
  observedAt?: string;
  cacheKey?: string | null;
  evidenceSignals: ObservationEvidenceSignal[];
}

export interface MetadataObservationBase {
  id?: string;
  provenance: MetadataObservationProvenance;
  usage: MetadataObservationUsage;
  raw?: unknown;
}

export type TitleObservationRole =
  | "object_title"
  | "catalog_title"
  | "edition_title"
  | "alias_title"
  | "listing_title"
  | "user_input_title";

export interface TitleObservation extends MetadataObservationBase {
  kind: "title";
  role: TitleObservationRole;
  value: string;
  language?: string | "neutral" | "unknown";
  region?: string | null;
}

export type ImageObservationRole =
  | "cover_front"
  | "cover_back"
  | "product_packshot"
  | "listing_photo"
  | "user_photo"
  | "background"
  | "screenshot"
  | "logo"
  | "gallery_image";

export interface ImageObservation extends MetadataObservationBase {
  kind: "image";
  role: ImageObservationRole;
  url: string;
  type: AttachmentType;
  title?: string | null;
  language?: string | "neutral" | "unknown";
  region?: string | null;
  width?: number | null;
  height?: number | null;
}

export type FactObservationRole =
  | "structured_fact"
  | "listing_fact"
  | "inferred_fact"
  | "user_fact";

export interface FactObservation extends MetadataObservationBase {
  kind: "fact";
  role: FactObservationRole;
  factKind: string;
  label: string;
  value: string;
  unit?: string | null;
  url?: string | null;
}

export type AliasObservationRole =
  | "provider_grouped_alias"
  | "regional_alias"
  | "edition_alias"
  | "listing_alias"
  | "user_alias";

export interface AliasObservation extends MetadataObservationBase {
  kind: "alias";
  role: AliasObservationRole;
  value: string;
  language?: string | "neutral" | "unknown";
  region?: string | null;
}

export type OfferObservationRole =
  | "retail_offer"
  | "marketplace_offer"
  | "price_snapshot"
  | "user_price";

export interface OfferObservation extends MetadataObservationBase {
  kind: "offer";
  role: OfferObservationRole;
  condition?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  availability?: string | null;
}

export interface ExternalIdObservation extends MetadataObservationBase {
  kind: "external-id";
  role: "primary_id" | "cross_reference" | "barcode" | "provider_record_id";
  idKind: string;
  value: string;
}

export type MetadataObservation =
  | TitleObservation
  | ImageObservation
  | FactObservation
  | AliasObservation
  | OfferObservation
  | ExternalIdObservation;
