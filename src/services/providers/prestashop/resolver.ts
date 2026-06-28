import {
  acceptRetailerCatalogCandidate,
  retailerSearchHitLimit,
} from "@/lib/retailer/metadataLookup";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { normalizeBoardGamePlayerCount } from "@/lib/metadata/boardGame";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadata/observations";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type { MetadataAdapterContext } from "@/types/providerModule";
import type {
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";

import {
  fetchPrestashopGallery,
  mapPrestashopSearchProduct,
  prestashopImageId,
  searchPrestashopHits,
  searchPrestashopProduct,
} from "./fetch";

import type { PrestashopProduct, PrestashopRetailerConfig } from "./types";

const PRESTASHOP_LANGUAGE = "fr";

function buildPrestashopFacts(
  product: PrestashopProduct,
  label: string,
): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label,
      value: "Voir la fiche",
      url: product.productUrl,
      source: product.source,
      confidence: 0.68,
      priority: 38,
    },
  ];

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    facts.push({
      kind: "price",
      label: `Prix ${label}`,
      value: `${(product.priceCents / 100).toFixed(2).replace(".", ",")} €`,
      source: product.source,
      confidence: 0.66,
      priority: 52,
    });
  }

  if (product.players) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: normalizeBoardGamePlayerCount(product.players),
      source: product.source,
      confidence: 0.72,
      priority: 84,
    });
  }

  if (product.playtime) {
    facts.push({
      kind: "playtime",
      label: "Durée d'une partie",
      value: product.playtime,
      source: product.source,
      confidence: 0.7,
      priority: 82,
    });
  }

  if (product.ageRating) {
    facts.push({
      kind: "age-rating",
      label: "Âge recommandé",
      value: product.ageRating,
      source: product.source,
      confidence: 0.68,
      priority: 72,
    });
  }

  if (product.reference) {
    facts.push({
      kind: "identifier",
      label: "Référence",
      value: product.reference,
      source: product.source,
      confidence: 0.58,
      priority: 32,
    });
  }

  return facts;
}

function buildPrestashopObservations(
  product: PrestashopProduct,
  label: string,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  const mappedObservations = observationsFromMetadataResult(metadata, {
    providerId: product.source,
    providerLabel: label,
    sourceDocumentRole: "catalog_product",
    sourceUrl: product.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: PRESTASHOP_LANGUAGE,
  });
  const observations: MetadataObservation[] = [];
  for (const observation of mappedObservations) {
    if (
      observation.kind === "image" &&
      observation.type !== "cover" &&
      observation.role === "cover_front"
    ) {
      observations.push({
        ...observation,
        role: "gallery_image",
      });
      continue;
    }
    observations.push(observation);
  }

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    observations.push({
      kind: "offer",
      role: "retail_offer",
      priceCents: product.priceCents,
      currency: "EUR",
      provenance: {
        providerId: product.source,
        providerLabel: label,
        sourceDocumentRole: "offer",
        sourceUrl: product.productUrl,
        evidenceSignals,
      },
      usage: makeObservationUsage({
        displayCandidate: false,
        searchAlias: "none",
        evidence: "weak",
      }),
    });
  }

  if (metadata.barcode) {
    observations.push({
      kind: "external-id",
      role: "barcode",
      idKind: "ean13",
      value: metadata.barcode,
      provenance: {
        providerId: product.source,
        providerLabel: label,
        sourceDocumentRole: "catalog_product",
        sourceUrl: product.productUrl,
        evidenceSignals,
      },
      usage: makeObservationUsage({
        evidence: "strong",
      }),
    });
  }

  return observations;
}

export function mapPrestashopMetadata(
  product: PrestashopProduct,
  label: string,
  galleryImages: string[] = [],
): MetadataResult {
  const coverId = prestashopImageId(product.imageUrl);
  const attachments: MetadataAttachment[] = [];
  if (product.imageUrl) {
    attachments.push({
      type: "cover",
      url: product.imageUrl,
      role: PRESTASHOP_LANGUAGE,
      source: product.source,
    });
  }
  for (const url of galleryImages) {
    // La couverture est déjà ajoutée ; on évite de la redupliquer.
    if (prestashopImageId(url) === coverId) continue;
    attachments.push({
      type: "image",
      url,
      role: PRESTASHOP_LANGUAGE,
      source: product.source,
    });
  }

  const metadata: MetadataResult = {
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    barcode: normalizeProductBarcode(product.barcode),
    releaseDate: product.releaseDate,
    regionalTitles: product.title
      ? [{ region: PRESTASHOP_LANGUAGE, text: product.title }]
      : undefined,
    publishers: product.manufacturer
      ? [{ name: product.manufacturer }]
      : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    facts: buildPrestashopFacts(product, label),
  };
  return {
    ...metadata,
    observations: buildPrestashopObservations(product, label, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function createPrestashopResolver(config: PrestashopRetailerConfig) {
  return async function fetchFromPrestashopRetailer(
    ctx: MetadataAdapterContext,
  ): Promise<MetadataResult | null> {
    const requestedName = ctx.name.trim();
    const normalizedBarcode = normalizeProductBarcode(ctx.barcode);
    const queries =
      ctx.lookupQueries && ctx.lookupQueries.length > 0
        ? ctx.lookupQueries
        : [requestedName].filter(Boolean);
    if (queries.length === 0 && !normalizedBarcode) return null;

    try {
      if (normalizedBarcode) {
        const product = await searchPrestashopProduct(
          config,
          requestedName,
          normalizedBarcode,
          queries,
        );
        if (product?.title) {
          const barcodeConfirmed =
            normalizeProductBarcode(product.barcode) === normalizedBarcode;
          if (
            acceptRetailerCatalogCandidate({
              requestedName,
              shelfName: ctx.shelfName,
              catalogTitle: product.title,
              barcodeConfirmed,
            })
          ) {
            const galleryImages = await fetchPrestashopGallery(
              product.productUrl,
            );
            return mapPrestashopMetadata(product, config.label, galleryImages);
          }
        }
      }

      const seenProductKeys = new Set<string>();

      for (const query of queries) {
        if (!query) continue;

        const hitLimit = retailerSearchHitLimit({
          requestedName,
          searchQuery: query,
          shelfName: ctx.shelfName,
        });
        const hits = (await searchPrestashopHits(config, query)).slice(
          0,
          hitLimit,
        );

        for (const hit of hits) {
          const key =
            hit.id_product?.toString() ||
            hit.link ||
            hit.name?.trim() ||
            "";
          if (!key || seenProductKeys.has(key)) continue;
          seenProductKeys.add(key);

          const product = mapPrestashopSearchProduct(config, hit);
          if (!product?.title) continue;

          if (
            !acceptRetailerCatalogCandidate({
              requestedName,
              searchQuery: query,
              shelfName: ctx.shelfName,
              catalogTitle: product.title,
            })
          ) {
            continue;
          }

          const galleryImages = await fetchPrestashopGallery(
            product.productUrl,
          );
          return mapPrestashopMetadata(product, config.label, galleryImages);
        }
      }

      return null;
    } catch (error) {
      console.error(`[${config.label}] Metadata lookup failed:`, error);
      return null;
    }
  };
}

export { buildPrestashopFacts };
