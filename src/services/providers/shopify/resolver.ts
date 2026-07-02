import {
  acceptRetailerCatalogCandidate,
  retailerSearchHitLimit,
} from "@/lib/retailer/metadataLookup";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type { MetadataAdapterContext } from "@/types/providerModule";

import { searchShopifyHits, searchShopifyProduct } from "./fetch";
import type { ShopifyProduct, ShopifyRetailerConfig } from "./types";

// Shopify storefronts here are French shops; tag their cover/gallery so the
// display scorer ranks region the same way the other FR retailers do.
const SHOPIFY_LANGUAGE = "fr";

function buildShopifyFacts(
  product: ShopifyProduct,
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
  return facts;
}

export function mapShopifyMetadata(
  product: ShopifyProduct,
  label: string,
): MetadataResult {
  const attachments: MetadataAttachment[] = [];
  if (product.imageUrl) {
    attachments.push({
      type: "cover",
      url: product.imageUrl,
      role: SHOPIFY_LANGUAGE,
      source: product.source,
    });
  }
  for (const url of product.galleryImages) {
    attachments.push({
      type: "image",
      url,
      role: SHOPIFY_LANGUAGE,
      source: product.source,
    });
  }

  return {
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    barcode: normalizeProductBarcode(product.barcode),
    regionalTitles: [{ region: SHOPIFY_LANGUAGE, text: product.title }],
    publishers: product.manufacturer
      ? [{ name: product.manufacturer }]
      : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    facts: buildShopifyFacts(product, label),
  };
}

export function createShopifyResolver(config: ShopifyRetailerConfig) {
  return async function fetchFromShopifyRetailer(
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
        const product = await searchShopifyProduct(
          config,
          requestedName,
          normalizedBarcode,
        );
        if (!product?.title) return null;

        const barcodeConfirmed =
          normalizeProductBarcode(product.barcode) === normalizedBarcode;
        if (
          !acceptRetailerCatalogCandidate({
            requestedName,
            catalogTitle: product.title,
            barcodeConfirmed,
          })
        ) {
          return null;
        }

        return mapShopifyMetadata(product, config.label);
      }

      const seenUrls = new Set<string>();

      for (const query of queries) {
        if (!query) continue;

        const hitLimit = retailerSearchHitLimit({
          requestedName,
          searchQuery: query,
          shelfName: ctx.shelfName,
        });
        const hits = await searchShopifyHits(config, query, null, hitLimit);

        for (const product of hits) {
          if (seenUrls.has(product.productUrl)) continue;
          seenUrls.add(product.productUrl);
          if (!product.title) continue;

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

          return mapShopifyMetadata(product, config.label);
        }
      }

      return null;
    } catch (error) {
      console.error(`[${config.label}] Metadata lookup failed:`, error);
      return null;
    }
  };
}
