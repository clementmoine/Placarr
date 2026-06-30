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
  fetchPhilibertProduct,
  philibertImageId,
  resolvePhilibertBackgroundUrl,
  searchPhilibertHits,
  type PhilibertProduct,
} from "./fetch";

const PHILIBERT_REGION = "fr";

function buildPhilibertFacts(product: PhilibertProduct): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Philibert",
      value: "Voir la fiche",
      url: product.productUrl,
      source: "philibert",
      confidence: 0.72,
      priority: 40,
    },
  ];

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    facts.push({
      kind: "price",
      label: "Prix Philibert",
      value: `${(product.priceCents / 100).toFixed(2).replace(".", ",")} €`,
      source: "philibert",
      confidence: 0.7,
      priority: 55,
    });
  }

  if (product.players) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: normalizeBoardGamePlayerCount(product.players),
      source: "philibert",
      confidence: 0.76,
      priority: 88,
    });
  }

  if (product.playtime) {
    facts.push({
      kind: "playtime",
      label: "Durée d'une partie",
      value: product.playtime,
      source: "philibert",
      confidence: 0.74,
      priority: 86,
    });
  }

  if (product.ageRating) {
    facts.push({
      kind: "age-rating",
      label: "Âge recommandé",
      value: product.ageRating,
      source: "philibert",
      confidence: 0.72,
      priority: 74,
    });
  }

  if (product.rating) {
    const formattedRating = product.rating.replace(".", ",");
    const countSuffix =
      product.reviewCount != null && product.reviewCount > 0
        ? ` (${new Intl.NumberFormat("fr-FR").format(product.reviewCount)} avis)`
        : "";
    facts.push({
      kind: "rating",
      label: "Philibert",
      value: `${formattedRating}/5${countSuffix}`,
      source: "philibert",
      confidence: 0.68,
      priority: 70,
    });
  }

  for (const [index, review] of (product.reviews || []).slice(0, 3).entries()) {
    if (!review.text && !review.rating) continue;

    const value = [
      review.rating ? `${review.rating.replace(".", ",")}/5` : null,
      review.text,
    ]
      .filter(Boolean)
      .join(" — ");

    facts.push({
      kind: "review",
      label: review.author || `Avis ${index + 1}`,
      value,
      source: "philibert",
      confidence: 0.62,
      priority: 45 - index,
    });
  }

  if (product.language) {
    facts.push({
      kind: "language",
      label: "Langue",
      value: product.language,
      source: "philibert",
      confidence: 0.66,
      priority: 48,
    });
  }

  if (product.themes && product.themes.length > 0) {
    facts.push({
      kind: "category",
      label: "Thèmes",
      value: product.themes.join(" • "),
      source: "philibert",
      confidence: 0.64,
      priority: 52,
    });
  }

  if (product.mechanics && product.mechanics.length > 0) {
    facts.push({
      kind: "mechanic",
      label: "Mécanismes",
      value: product.mechanics.join(" • "),
      source: "philibert",
      confidence: 0.64,
      priority: 50,
    });
  }

  if (product.country) {
    facts.push({
      kind: "origin",
      label: "Pays",
      value: product.country,
      source: "philibert",
      confidence: 0.6,
      priority: 36,
    });
  }

  if (product.reference) {
    facts.push({
      kind: "identifier",
      label: "Référence",
      value: product.reference,
      source: "philibert",
      confidence: 0.62,
      priority: 34,
    });
  }

  return facts;
}

function buildPhilibertAttachments(
  product: PhilibertProduct,
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];
  const coverId = philibertImageId(product.imageUrl);
  const backgroundUrl = product.backgroundImageUrl;

  if (product.imageUrl) {
    attachments.push({
      type: "cover",
      url: product.imageUrl,
      role: PHILIBERT_REGION,
      source: "philibert",
    });
  }
  if (backgroundUrl) {
    attachments.push({
      type: "background",
      url: backgroundUrl,
      role: PHILIBERT_REGION,
      source: "philibert",
    });
  }

  for (const url of product.images ?? []) {
    if (philibertImageId(url) === coverId || url === backgroundUrl) continue;
    attachments.push({
      type: "image",
      url,
      role: PHILIBERT_REGION,
      source: "philibert",
    });
  }

  return attachments.length > 0 ? attachments : undefined;
}

function buildPhilibertObservations(
  product: PhilibertProduct,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (metadata.barcode) evidenceSignals.push("barcode_match");

  const observations = observationsFromMetadataResult(metadata, {
    providerId: "philibert",
    providerLabel: "Philibert",
    sourceDocumentRole: "catalog_product",
    sourceUrl: product.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: PHILIBERT_REGION,
  });

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    observations.push({
      kind: "offer",
      role: "retail_offer",
      priceCents: product.priceCents,
      currency: "EUR",
      provenance: {
        providerId: "philibert",
        providerLabel: "Philibert",
        sourceDocumentRole: "offer",
        sourceUrl: product.productUrl,
        evidenceSignals: ["structured_data"],
      },
      usage: makeObservationUsage({
        evidence: "weak",
        searchAlias: "none",
        displayCandidate: false,
      }),
    });
  }

  return observations;
}

function mapPhilibertMetadata(product: PhilibertProduct): MetadataResult {
  const metadata: MetadataResult = {
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    heroImageUrl: product.backgroundImageUrl,
    barcode: normalizeProductBarcode(product.barcode),
    regionalTitles: product.title
      ? [{ region: PHILIBERT_REGION, text: product.title }]
      : undefined,
    authors: product.designers?.map((name) => ({ name })),
    publishers: product.publishers?.map((name) => ({ name })),
    attachments: buildPhilibertAttachments(product),
    facts: buildPhilibertFacts(product),
  };
  return {
    ...metadata,
    observations: buildPhilibertObservations(product, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function resolvePhilibertHit(
  hit: { url: string; title?: string; barcode?: string },
  requestedName: string,
  normalizedBarcode: string | null,
  input: {
    searchQuery?: string;
    shelfName?: string | null;
  },
): Promise<MetadataResult | null> {
  const product = await fetchPhilibertProduct(hit.url);
  const title = product.title || hit.title;
  if (!title) return null;

  const resolvedBarcode =
    normalizeProductBarcode(product.barcode) ||
    normalizeProductBarcode(hit.barcode);
  const barcodeConfirmed =
    !!normalizedBarcode && resolvedBarcode === normalizedBarcode;
  const barcodeContradicted =
    !!normalizedBarcode &&
    !!resolvedBarcode &&
    resolvedBarcode !== normalizedBarcode;

  if (barcodeContradicted) return null;

  if (
    !acceptRetailerCatalogCandidate({
      requestedName,
      searchQuery: input.searchQuery,
      shelfName: input.shelfName,
      catalogTitle: title,
      barcodeConfirmed,
      trustConfirmedProductBarcode: true,
    })
  ) {
    return null;
  }

  const backgroundImageUrl = await resolvePhilibertBackgroundUrl(product);

  return mapPhilibertMetadata({
    ...product,
    title,
    barcode:
      product.barcode || hit.barcode || normalizedBarcode || undefined,
    backgroundImageUrl,
  });
}

export function createPhilibertResolver() {
  return async function fetchFromPhilibert(
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
      const seenUrls = new Set<string>();

      if (normalizedBarcode) {
        const hits = await searchPhilibertHits(
          normalizedBarcode,
          normalizedBarcode,
          retailerSearchHitLimit({
            requestedName,
            searchQuery: requestedName,
            shelfName: ctx.shelfName,
          }),
        );

        for (const hit of hits) {
          if (seenUrls.has(hit.url)) continue;
          seenUrls.add(hit.url);

          const result = await resolvePhilibertHit(
            hit,
            requestedName,
            normalizedBarcode,
            { shelfName: ctx.shelfName },
          );
          if (result) return result;
        }
      }

      for (const query of queries) {
        if (!query) continue;

        const hitLimit = retailerSearchHitLimit({
          requestedName,
          searchQuery: query,
          shelfName: ctx.shelfName,
        });
        const hits = await searchPhilibertHits(query, null, hitLimit);

        for (const hit of hits) {
          if (seenUrls.has(hit.url)) continue;
          seenUrls.add(hit.url);

          const result = await resolvePhilibertHit(hit, requestedName, null, {
            searchQuery: query,
            shelfName: ctx.shelfName,
          });
          if (result) return result;
        }
      }

      return null;
    } catch (error) {
      console.error("[Philibert] Metadata lookup failed:", error);
      return null;
    }
  };
}

export {
  mapPhilibertMetadata,
  buildPhilibertFacts,
  buildPhilibertObservations,
};
