import {
  acceptRetailerCatalogCandidate,
  retailerSearchHitLimit,
} from "@/core/commerce/retailer/metadataLookup";
import { formatScore } from "@/core/enrich/search/searchUtils";
import {
  resolveGameAttachmentPlatformKey,
  withMetadataPlatformKeys,
} from "@/core/enrich/media/platformKeyStamp";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type { MetadataAdapterContext } from "@/types/providerModule";
import type { MediaType } from "@/types/providerRegistry";
import type {
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";

import {
  fetchSensCritiqueProduct,
  searchSensCritique,
  SENSCRITIQUE_UNIVERSES_BY_TYPE,
  type SensCritiqueProduct,
} from "./fetch";

const SENSCRITIQUE_REGION = "fr";

function buildSensCritiqueFacts(product: SensCritiqueProduct): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "SensCritique",
      value: "Voir la fiche",
      url: product.productUrl,
      source: "senscritique",
      confidence: 0.72,
      priority: 40,
    },
  ];

  const rating =
    product.rating != null ? formatScore(product.rating, 10) : null;
  if (rating) {
    const votes =
      product.ratingCount != null && product.ratingCount > 0
        ? ` (${product.ratingCount.toLocaleString("fr-FR")} votes)`
        : "";
    facts.push({
      kind: "rating",
      label: "SensCritique",
      value: `${rating}${votes}`,
      url: product.productUrl,
      source: "senscritique",
      confidence: 0.74,
      priority: 76,
    });
  }

  if (product.genres?.length) {
    facts.push({
      kind: "genre",
      label: "Genre",
      value: product.genres.join(", "),
      source: "senscritique",
      confidence: 0.7,
      priority: 62,
    });
  }

  if (product.releaseYear) {
    facts.push({
      kind: "release-year",
      label: "Année",
      value: product.releaseYear,
      source: "senscritique",
      confidence: 0.7,
      priority: 60,
    });
  }

  return facts;
}

function buildSensCritiqueAttachments(
  product: SensCritiqueProduct,
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];
  const seen = new Set<string>();
  const push = (attachment: MetadataAttachment) => {
    const key = attachment.url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    attachments.push(attachment);
  };

  if (product.coverUrl) {
    push({
      type: "cover",
      url: product.coverUrl,
      role: SENSCRITIQUE_REGION,
      source: "senscritique",
    });
  }

  for (const url of product.posterUrls ?? []) {
    push({ type: "cover", url, source: "senscritique" });
  }

  if (product.backdropUrl) {
    push({
      type: "background",
      url: product.backdropUrl,
      source: "senscritique",
    });
  }

  for (const url of product.screenshotUrls ?? []) {
    push({ type: "screenshot", url, source: "senscritique" });
  }

  return attachments.length > 0 ? attachments : undefined;
}

function buildSensCritiqueObservations(
  product: SensCritiqueProduct,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];

  return observationsFromMetadataResult(metadata, {
    providerId: "senscritique",
    providerLabel: "SensCritique",
    sourceDocumentRole: "catalog_product",
    sourceUrl: product.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: SENSCRITIQUE_REGION,
  });
}

export function sensCritiqueAliases(
  product: SensCritiqueProduct,
): string[] | undefined {
  const aliases = [product.originalTitle, product.subtitle]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => value !== product.title);
  return aliases.length > 0 ? aliases : undefined;
}

export function mapSensCritiqueMetadata(
  product: SensCritiqueProduct,
  _ctx: {
    platform?: string | null;
    shelfName?: string | null;
  } = {},
): MetadataResult {
  const platformKey = resolveGameAttachmentPlatformKey({
    // Never pass shelf/request platform: SensCritique search is title-only and
    // must not masquerade as the shelf console (Atari item ≠ SNES Schtroumpfs).
    title: product.title,
    imageUrl: product.coverUrl,
    productUrl: product.productUrl,
  });

  const metadata: MetadataResult = withMetadataPlatformKeys(
    {
      title: product.title,
      description: product.synopsis,
      imageUrl: product.coverUrl,
      releaseDate: product.releaseYear,
      regionalTitles: [{ region: SENSCRITIQUE_REGION, text: product.title }],
      aliases: sensCritiqueAliases(product),
      authors: product.artists?.map((name) => ({ name })),
      attachments: buildSensCritiqueAttachments(product),
      facts: buildSensCritiqueFacts(product),
      platformKey: platformKey || undefined,
    },
    platformKey,
  );

  return {
    ...metadata,
    observations: buildSensCritiqueObservations(product, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function sensCritiqueUniversesForType(type?: string | null): string[] {
  if (!type) return [];
  return SENSCRITIQUE_UNIVERSES_BY_TYPE[type as MediaType] ?? [];
}

export function createSensCritiqueResolver() {
  return async function fetchFromSensCritique(
    ctx: MetadataAdapterContext,
  ): Promise<MetadataResult | null> {
    const requestedName = ctx.name?.trim() ?? "";
    // No EAN anywhere on SensCritique: name search only, never a barcode anchor.
    const universes = sensCritiqueUniversesForType(ctx.type);
    if (!requestedName || universes.length === 0) return null;

    const queries =
      ctx.lookupQueries && ctx.lookupQueries.length > 0
        ? ctx.lookupQueries
        : [requestedName];

    try {
      const seenIds = new Set<number>();

      for (const query of queries) {
        const cleanedQuery = query.trim();
        if (!cleanedQuery) continue;

        const hitLimit = retailerSearchHitLimit({
          requestedName,
          searchQuery: cleanedQuery,
          shelfName: ctx.shelfName,
        });

        for (const universe of universes) {
          const hits = await searchSensCritique(cleanedQuery, {
            universe,
            limit: hitLimit,
            signal: ctx.signal,
          });

          for (const hit of hits) {
            if (seenIds.has(hit.id)) continue;
            seenIds.add(hit.id);

            const product = await fetchSensCritiqueProduct(hit.id, ctx.signal);
            if (!product?.title) continue;

            // The search is very fuzzy ("wizard of wor" can rank God of War
            // first): never trust a hit without title alignment.
            if (
              !acceptRetailerCatalogCandidate({
                requestedName,
                searchQuery: cleanedQuery,
                shelfName: ctx.shelfName,
                catalogTitle: product.title,
                catalogAliases: sensCritiqueAliases(product),
                barcodeConfirmed: false,
              })
            ) {
              continue;
            }

            return mapSensCritiqueMetadata(product, {
              platform: ctx.platform,
              shelfName: ctx.shelfName,
            });
          }
        }
      }

      return null;
    } catch (error) {
      console.error("[SensCritique] Metadata lookup failed:", error);
      return null;
    }
  };
}
