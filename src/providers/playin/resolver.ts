import {
  acceptRetailerCatalogCandidate,
  retailerSearchHitLimit,
} from "@/core/commerce/retailer/metadataLookup";
import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/identify/normalize";
import {
  retailerProductBarcodeConfirmed,
  retailerProductUrlBarcodeConflicts,
} from "@/core/commerce/retailer/productUrl";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
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
  fetchPlayInProduct,
  searchPlayInHits,
  type PlayInProduct,
} from "./fetch";

const PLAYIN_REGION = "fr";

function buildPlayInFacts(product: PlayInProduct): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Play-In",
      value: "Voir la fiche",
      url: product.productUrl,
      source: "playin",
      confidence: 0.72,
      priority: 40,
    },
  ];

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    facts.push({
      kind: "price",
      label: "Prix Play-In",
      value: `${(product.priceCents / 100).toFixed(2).replace(".", ",")} €`,
      source: "playin",
      confidence: 0.66,
      priority: 54,
    });
  }

  return facts;
}

function buildPlayInAttachments(
  product: PlayInProduct,
): MetadataAttachment[] | undefined {
  const urls = product.images?.length
    ? product.images
    : product.imageUrl
      ? [product.imageUrl]
      : [];
  if (urls.length === 0) return undefined;

  return urls.map((url, index) => ({
    type: "cover",
    url,
    role: PLAYIN_REGION,
    source: "playin",
    ...(index === 0 ? {} : { label: product.title }),
  }));
}

function buildPlayInObservations(
  product: PlayInProduct,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (metadata.barcode) evidenceSignals.push("barcode_match");

  const observations = observationsFromMetadataResult(metadata, {
    providerId: "playin",
    providerLabel: "Play-In",
    sourceDocumentRole: "catalog_product",
    sourceUrl: product.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: PLAYIN_REGION,
  });

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    observations.push({
      kind: "offer",
      role: "price_snapshot",
      priceCents: product.priceCents,
      currency: "EUR",
      provenance: {
        providerId: "playin",
        providerLabel: "Play-In",
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

export function mapPlayInMetadata(product: PlayInProduct): MetadataResult {
  const metadata: MetadataResult = {
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    barcode: normalizeProductBarcode(product.barcode),
    regionalTitles: product.title
      ? [{ region: PLAYIN_REGION, text: product.title }]
      : undefined,
    attachments: buildPlayInAttachments(product),
    facts: buildPlayInFacts(product),
  };

  return {
    ...metadata,
    observations: buildPlayInObservations(product, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function createPlayInResolver() {
  return async function fetchFromPlayIn(
    ctx: MetadataAdapterContext,
  ): Promise<MetadataResult | null> {
    const requestedName = ctx.name.trim();
    const normalizedBarcode = normalizeProductBarcode(ctx.barcode);
    const baseQueries =
      ctx.lookupQueries && ctx.lookupQueries.length > 0
        ? ctx.lookupQueries
        : [requestedName].filter(Boolean);
    const queries =
      baseQueries.length > 0 ? baseQueries : normalizedBarcode ? [""] : [];
    if (queries.length === 0 && !normalizedBarcode) return null;

    try {
      const seenUrls = new Set<string>();

      for (const query of queries) {
        if (!query && !normalizedBarcode) continue;

        const hitLimit = retailerSearchHitLimit({
          requestedName,
          searchQuery: query,
          shelfName: ctx.shelfName,
        });

        const hits = await searchPlayInHits(query, normalizedBarcode, hitLimit);
        for (const hit of hits) {
          if (seenUrls.has(hit.url)) continue;
          seenUrls.add(hit.url);

          let product: PlayInProduct;
          try {
            product = await fetchPlayInProduct(hit.url);
          } catch {
            continue;
          }
          const title = product.title;
          if (!title) continue;

          const resolvedBarcode = normalizeProductBarcode(product.barcode);
          const urlBarcodeConfirmed = retailerProductBarcodeConfirmed(
            hit.url,
            resolvedBarcode,
            normalizedBarcode,
          );
          const catalogBarcodeConfirmed =
            (!!normalizedBarcode &&
              resolvedBarcode &&
              barcodesEquivalent(resolvedBarcode, normalizedBarcode)) ||
            urlBarcodeConfirmed;
          const barcodeContradicted =
            !!normalizedBarcode &&
            !!resolvedBarcode &&
            !barcodesEquivalent(resolvedBarcode, normalizedBarcode);

          if (barcodeContradicted) continue;

          if (
            normalizedBarcode &&
            retailerProductUrlBarcodeConflicts(hit.url, normalizedBarcode)
          ) {
            continue;
          }

          if (normalizedBarcode && !catalogBarcodeConfirmed) continue;

          if (
            !acceptRetailerCatalogCandidate({
              requestedName,
              searchQuery: query,
              shelfName: ctx.shelfName,
              catalogTitle: title,
              catalogAliases: product.listingTitles,
              barcodeConfirmed: catalogBarcodeConfirmed,
              trustConfirmedProductBarcode: true,
              itemBarcode: normalizedBarcode,
            })
          ) {
            continue;
          }

          return mapPlayInMetadata({
            ...product,
            barcode: product.barcode || normalizedBarcode || undefined,
          });
        }
      }

      return null;
    } catch (error) {
      console.error("[Play-In] Metadata lookup failed:", error);
      return null;
    }
  };
}
