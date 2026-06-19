import levenshtein from "fast-levenshtein";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { normalizeBoardGamePlayerCount } from "@/lib/boardGamePlayers";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

import {
  fetchPhilibertProduct,
  philibertImageId,
  resolvePhilibertBackgroundUrl,
  searchPhilibert,
  type PhilibertProduct,
} from "./fetch";

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
      source: "philibert",
    });
  }
  if (backgroundUrl) {
    attachments.push({
      type: "background",
      url: backgroundUrl,
      source: "philibert",
    });
  }

  for (const url of product.images ?? []) {
    // La couverture (variante carrée) et le fond sont déjà ajoutés ci-dessus.
    if (philibertImageId(url) === coverId || url === backgroundUrl) continue;
    attachments.push({ type: "image", url, source: "philibert" });
  }

  return attachments.length > 0 ? attachments : undefined;
}

function mapPhilibertMetadata(product: PhilibertProduct): MetadataResult {
  return {
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    barcode: normalizeProductBarcode(product.barcode),
    authors: product.designers?.map((name) => ({ name })),
    publishers: product.publishers?.map((name) => ({ name })),
    attachments: buildPhilibertAttachments(product),
    facts: buildPhilibertFacts(product),
  };
}

export function createPhilibertResolver() {
  return async function fetchFromPhilibert(
    name: string,
    barcode?: string | null,
  ): Promise<MetadataResult | null> {
    const query = name.trim();
    const normalizedBarcode = normalizeProductBarcode(barcode);
    if (!query && !normalizedBarcode) return null;

    try {
      const hit = await searchPhilibert(
        query || normalizedBarcode || "",
        normalizedBarcode,
      );
      if (!hit) return null;

      const product = await fetchPhilibertProduct(hit.url);
      const title = product.title || hit.title;
      if (!title) return null;

      // A barcode is only trustworthy when the product page or the result URL
      // confirms it. Otherwise the search may have returned an unrelated first
      // hit, so fall back to a title match (or reject outright).
      const resolvedBarcode =
        normalizeProductBarcode(product.barcode) ||
        normalizeProductBarcode(hit.barcode);
      const barcodeConfirmed =
        !!normalizedBarcode && resolvedBarcode === normalizedBarcode;

      if (!barcodeConfirmed) {
        if (!query) return null;
        const distance = levenshtein.get(
          query.toLowerCase(),
          title.toLowerCase(),
        );
        if (distance > Math.max(8, query.length * 0.6)) {
          return null;
        }
      }

      const backgroundImageUrl = await resolvePhilibertBackgroundUrl(product);

      return mapPhilibertMetadata({
        ...product,
        title,
        barcode:
          product.barcode || hit.barcode || normalizedBarcode || undefined,
        backgroundImageUrl,
      });
    } catch (error) {
      console.error("[Philibert] Metadata lookup failed:", error);
      return null;
    }
  };
}

export { mapPhilibertMetadata, buildPhilibertFacts };
