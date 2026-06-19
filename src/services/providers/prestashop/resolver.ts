import levenshtein from "fast-levenshtein";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { normalizeBoardGamePlayerCount } from "@/lib/boardGamePlayers";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

import { searchPrestashopProduct } from "./fetch";

import type { PrestashopProduct, PrestashopRetailerConfig } from "./types";

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

export function mapPrestashopMetadata(
  product: PrestashopProduct,
  label: string,
): MetadataResult {
  return {
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    barcode: normalizeProductBarcode(product.barcode),
    releaseDate: product.releaseDate,
    publishers: product.manufacturer
      ? [{ name: product.manufacturer }]
      : undefined,
    attachments: product.imageUrl
      ? [{ type: "cover", url: product.imageUrl, source: product.source }]
      : undefined,
    facts: buildPrestashopFacts(product, label),
  };
}

export function createPrestashopResolver(config: PrestashopRetailerConfig) {
  return async function fetchFromPrestashopRetailer(
    name: string,
    barcode?: string | null,
  ): Promise<MetadataResult | null> {
    const query = name.trim();
    const normalizedBarcode = normalizeProductBarcode(barcode);
    if (!query && !normalizedBarcode) return null;

    try {
      const product = await searchPrestashopProduct(
        config,
        query || normalizedBarcode || "",
        normalizedBarcode,
      );
      if (!product?.title) return null;

      // A barcode is only trustworthy when the retailer's own ean13/URL
      // confirms it. Otherwise the search may have returned an unrelated
      // first hit, so fall back to a title match (or reject outright).
      const barcodeConfirmed =
        !!normalizedBarcode &&
        normalizeProductBarcode(product.barcode) === normalizedBarcode;

      if (!barcodeConfirmed) {
        if (!query) return null;
        const distance = levenshtein.get(
          query.toLowerCase(),
          product.title.toLowerCase(),
        );
        if (distance > Math.max(8, query.length * 0.6)) {
          return null;
        }
      }

      return mapPrestashopMetadata(product, config.label);
    } catch (error) {
      console.error(`[${config.label}] Metadata lookup failed:`, error);
      return null;
    }
  };
}

export { buildPrestashopFacts };
