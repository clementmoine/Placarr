import {
  acceptRetailerCatalogCandidate,
  retailerSearchHitLimit,
} from "@/core/retailer/metadataLookup";
import {
  barcodesEquivalent,
  normalizeProductBarcode,
} from "@/core/barcode/normalize";
import {
  retailerProductBarcodeConfirmed,
  retailerProductUrlBarcodeConflicts,
} from "@/core/retailer/productUrl";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/metadata/observations";
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
  fetchEspritJeuProduct,
  searchEspritJeuHits,
  type EspritJeuProduct,
} from "./fetch";

const ESPRITJEU_REGION = "fr";

function buildEspritJeuFacts(product: EspritJeuProduct): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Esprit Jeu",
      value: "Voir la fiche",
      url: product.productUrl,
      source: "espritjeu",
      confidence: 0.72,
      priority: 40,
    },
  ];

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    facts.push({
      kind: "price",
      label: "Prix Esprit Jeu",
      value: `${(product.priceCents / 100).toFixed(2).replace(".", ",")} €`,
      source: "espritjeu",
      confidence: 0.66,
      priority: 54,
    });
  }

  return facts;
}

function buildEspritJeuAttachments(
  product: EspritJeuProduct,
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
    role: ESPRITJEU_REGION,
    source: "espritjeu",
    ...(index === 0 ? {} : { label: product.title }),
  }));
}

function buildEspritJeuObservations(
  product: EspritJeuProduct,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (metadata.barcode) evidenceSignals.push("barcode_match");

  const observations = observationsFromMetadataResult(metadata, {
    providerId: "espritjeu",
    providerLabel: "Esprit Jeu",
    sourceDocumentRole: "catalog_product",
    sourceUrl: product.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: ESPRITJEU_REGION,
  });

  if (product.priceCents != null && Number.isFinite(product.priceCents)) {
    observations.push({
      kind: "offer",
      role: "price_snapshot",
      priceCents: product.priceCents,
      currency: "EUR",
      provenance: {
        providerId: "espritjeu",
        providerLabel: "Esprit Jeu",
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

export function mapEspritJeuMetadata(product: EspritJeuProduct): MetadataResult {
  const metadata: MetadataResult = {
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    barcode: normalizeProductBarcode(product.barcode),
    regionalTitles: product.title
      ? [{ region: ESPRITJEU_REGION, text: product.title }]
      : undefined,
    aliases: product.listingTitles?.length ? product.listingTitles : undefined,
    attachments: buildEspritJeuAttachments(product),
    facts: buildEspritJeuFacts(product),
  };

  return {
    ...metadata,
    observations: buildEspritJeuObservations(product, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function createEspritJeuResolver() {
  return async function fetchFromEspritJeu(
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

        const hits = await searchEspritJeuHits(
          query,
          normalizedBarcode,
          hitLimit,
        );
        for (const hit of hits) {
          if (seenUrls.has(hit.url)) continue;
          seenUrls.add(hit.url);

          let product: EspritJeuProduct;
          try {
            product = await fetchEspritJeuProduct(hit.url);
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

          const listingTitles = [
            ...(product.listingTitles ?? []),
            ...(hit.title ? [hit.title] : []),
          ];

          if (
            !acceptRetailerCatalogCandidate({
              requestedName,
              searchQuery: query,
              shelfName: ctx.shelfName,
              catalogTitle: title,
              catalogAliases: listingTitles,
              barcodeConfirmed: catalogBarcodeConfirmed,
              trustConfirmedProductBarcode: true,
              itemBarcode: normalizedBarcode,
            })
          ) {
            continue;
          }

          return mapEspritJeuMetadata({
            ...product,
            listingTitles:
              listingTitles.length > 0 ? listingTitles : product.listingTitles,
            barcode: product.barcode || normalizedBarcode || undefined,
          });
        }
      }

      return null;
    } catch (error) {
      console.error("[Esprit Jeu] Metadata lookup failed:", error);
      return null;
    }
  };
}
