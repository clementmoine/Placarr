import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadata/observations";
import { wrapMetadataProviderAdapter } from "@/lib/metadata/providerQueue";
import { PROVIDER_MODULES } from "@/services/provider/registry";

import type { MetadataResult } from "@/types/metadataProvider";
import type {
  ImageObservationRole,
  MetadataObservation,
  ObservationEvidenceSignal,
  ObservationSourceDocumentRole,
  TitleObservationRole,
} from "@/types/metadataObservation";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

export function createMetadataAdapters(): MetadataProviderAdapter[] {
  return PROVIDER_MODULES.flatMap((module) => {
    if (!module.createMetadataAdapter) return [];
    const adapter = module.createMetadataAdapter();
    return adapter ? [withProviderObservations(module, adapter)] : [];
  });
}

export function buildMetadataAdapterMap(): Map<string, MetadataProviderAdapter> {
  return new Map(
    createMetadataAdapters().map((adapter) => [
      adapter.id,
      wrapMetadataProviderAdapter(adapter),
    ]),
  );
}

export const metadataProviderResolverMap = buildMetadataAdapterMap();

export function getMetadataProviderAdapter(
  id: string,
): MetadataProviderAdapter | undefined {
  return metadataProviderResolverMap.get(id);
}

type ObservationDefaults = {
  sourceDocumentRole: ObservationSourceDocumentRole;
  titleRole: TitleObservationRole;
  aliasRole:
    | "provider_grouped_alias"
    | "regional_alias"
    | "edition_alias"
    | "listing_alias";
  imageRole: ImageObservationRole;
  factRole: "structured_fact" | "listing_fact";
};

function inferObservationDefaults(module: ProviderModule): ObservationDefaults {
  if (module.evidence?.trustedRetailer) {
    return {
      sourceDocumentRole: "catalog_product",
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
    };
  }

  const marketplaceLike =
    !module.info.canonical && module.info.capabilities.includes("price");
  if (marketplaceLike) {
    return {
      sourceDocumentRole: "marketplace_listing",
      titleRole: "listing_title",
      aliasRole: "listing_alias",
      imageRole: "listing_photo",
      factRole: "listing_fact",
    };
  }

  if (module.info.canonical) {
    return {
      sourceDocumentRole: "reference_record",
      titleRole: "object_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
    };
  }

  return {
    sourceDocumentRole: "api_object",
    titleRole: "object_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
  };
}

function inferEvidenceSignals(
  metadata: MetadataResult,
  ctx: MetadataAdapterContext,
): ObservationEvidenceSignal[] {
  const signals = new Set<ObservationEvidenceSignal>(["structured_data"]);
  const metadataBarcode = normalizeProductBarcode(metadata.barcode);
  const contextBarcode = normalizeProductBarcode(ctx.barcode);
  if (contextBarcode && metadataBarcode && contextBarcode === metadataBarcode) {
    signals.add("barcode_match");
  }
  if (
    ctx.platform &&
    metadata.platformKey &&
    ctx.platform.trim().toLowerCase() === metadata.platformKey.trim().toLowerCase()
  ) {
    signals.add("platform_match");
  }
  if (
    Object.values(metadata.externalIds || {}).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    )
  ) {
    signals.add("external_id");
  }

  const query = ctx.name.trim().toLowerCase();
  const title = String(metadata.title || "")
    .trim()
    .toLowerCase();
  if (
    query &&
    title &&
    (query === title || query.includes(title) || title.includes(query))
  ) {
    signals.add("title_match");
  }

  return Array.from(signals);
}

function inferSourceUrl(metadata: MetadataResult, providerId: string): string | undefined {
  const direct = (metadata.facts || []).find(
    (fact) =>
      fact.kind === "external-link" &&
      fact.url &&
      (!fact.source ||
        fact.source.trim().toLowerCase() === providerId.trim().toLowerCase()),
  )?.url;
  if (direct) return direct;
  return (metadata.facts || []).find((fact) => fact.url)?.url;
}

function providerSourceId(
  metadata: MetadataResult,
  providerId: string,
): string | undefined {
  const value = metadata.externalIds?.[providerId];
  if (!value) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function inferBarcodeKind(value: string): string {
  if (/^\d{13}$/.test(value)) return "ean13";
  if (/^\d{12}$/.test(value)) return "upc";
  return "barcode";
}

function normalizeObservationImages(
  observations: MetadataObservation[],
  defaults: ObservationDefaults,
): MetadataObservation[] {
  return observations.map((observation) => {
    if (observation.kind !== "image") return observation;
    if (defaults.imageRole === "listing_photo") return observation;

    const region = (observation.region || "").toLowerCase();
    if (region.includes("back")) {
      return { ...observation, role: "cover_back" };
    }
    if (observation.type === "background") {
      return { ...observation, role: "background" };
    }
    if (observation.type === "screenshot") {
      return { ...observation, role: "screenshot" };
    }
    if (observation.type === "logo") {
      return { ...observation, role: "logo" };
    }
    if (observation.type !== "cover" && observation.role === "cover_front") {
      return { ...observation, role: "gallery_image" };
    }
    return observation;
  });
}

function withProviderObservations(
  module: ProviderModule,
  adapter: MetadataProviderAdapter,
): MetadataProviderAdapter {
  return {
    id: adapter.id,
    async resolve(ctx: MetadataAdapterContext) {
      const metadata = await adapter.resolve(ctx);
      if (!metadata) return null;
      if (metadata.observations && metadata.observations.length > 0) {
        if (metadata.observationSchemaVersion) return metadata;
        return {
          ...metadata,
          observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
        };
      }

      const defaults = inferObservationDefaults(module);
      const visualAttachments = (metadata.attachments || []).filter(
        (attachment) => attachment.type !== "audio",
      );
      const sourceUrl = inferSourceUrl(metadata, adapter.id);
      const sourceId = providerSourceId(metadata, adapter.id);
      const evidenceSignals = inferEvidenceSignals(metadata, ctx);

      let observations = observationsFromMetadataResult(
        {
          ...metadata,
          imageUrl: visualAttachments.length > 0 ? undefined : metadata.imageUrl,
          attachments: visualAttachments.length > 0 ? visualAttachments : undefined,
        },
        {
          providerId: adapter.id,
          providerLabel: module.info.label,
          sourceDocumentRole: defaults.sourceDocumentRole,
          sourceUrl,
          sourceId,
          evidenceSignals,
          titleRole: defaults.titleRole,
          aliasRole: defaults.aliasRole,
          imageRole: defaults.imageRole,
          factRole: defaults.factRole,
          externalIdRole: "provider_record_id",
          language: "unknown",
        },
      );

      observations = normalizeObservationImages(observations, defaults);

      if (metadata.barcode) {
        const normalizedBarcode = normalizeProductBarcode(metadata.barcode);
        if (normalizedBarcode) {
          const hasBarcodeObservation = observations.some(
            (observation) =>
              observation.kind === "external-id" &&
              observation.role === "barcode" &&
              observation.value === normalizedBarcode,
          );
          if (!hasBarcodeObservation) {
            observations.push({
              kind: "external-id",
              role: "barcode",
              idKind: inferBarcodeKind(normalizedBarcode),
              value: normalizedBarcode,
              provenance: {
                providerId: adapter.id,
                providerLabel: module.info.label,
                sourceDocumentRole: defaults.sourceDocumentRole,
                sourceUrl,
                sourceId,
                evidenceSignals,
              },
              usage: makeObservationUsage({
                evidence: "strong",
              }),
            });
          }
        }
      }

      return {
        ...metadata,
        observations,
        observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
      };
    },
  };
}
