import levenshtein from "fast-levenshtein";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { normalizeBoardGamePlayerCount } from "@/lib/boardGamePlayers";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

import { fetchOkkazeoGame, searchOkkazeo, type OkkazeoGame } from "./fetch";

// okkazeo.com is a FR board-game database → its single cover is the FR edition.
// Tagging the attachment with the "fr" role lets the generic locale-aware image
// ranking (attachmentDisplayScore) prefer it, exactly like ScreenScraper/BGG.
const OKKAZEO_REGION = "fr";

function buildOkkazeoFacts(game: OkkazeoGame): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Okkazeo",
      value: "Voir la fiche",
      url: game.productUrl,
      source: "okkazeo",
      confidence: 0.72,
      priority: 40,
    },
  ];

  if (game.priceCents != null && Number.isFinite(game.priceCents)) {
    facts.push({
      kind: "price",
      label: "Prix Okkazeo",
      value: `${(game.priceCents / 100).toFixed(2).replace(".", ",")} €`,
      source: "okkazeo",
      confidence: 0.66,
      priority: 54,
    });
  }

  if (game.players) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: normalizeBoardGamePlayerCount(game.players),
      source: "okkazeo",
      confidence: 0.76,
      priority: 88,
    });
  }

  if (game.playtime) {
    facts.push({
      kind: "playtime",
      label: "Durée d'une partie",
      value: game.playtime,
      source: "okkazeo",
      confidence: 0.74,
      priority: 86,
    });
  }

  if (game.ageRating) {
    facts.push({
      kind: "age-rating",
      label: "Âge recommandé",
      value: game.ageRating,
      source: "okkazeo",
      confidence: 0.72,
      priority: 74,
    });
  }

  if (game.year) {
    facts.push({
      kind: "release-year",
      label: "Année",
      value: game.year,
      source: "okkazeo",
      confidence: 0.7,
      priority: 60,
    });
  }

  if (game.categories && game.categories.length > 0) {
    facts.push({
      kind: "category",
      label: "Catégories",
      value: game.categories.join(" • "),
      source: "okkazeo",
      confidence: 0.64,
      priority: 52,
    });
  }

  return facts;
}

function buildOkkazeoAttachments(
  game: OkkazeoGame,
): MetadataAttachment[] | undefined {
  if (!game.imageUrl) return undefined;
  return [
    {
      type: "cover",
      url: game.imageUrl,
      role: OKKAZEO_REGION,
      source: "okkazeo",
    },
  ];
}

function mapOkkazeoMetadata(game: OkkazeoGame): MetadataResult {
  return {
    title: game.title,
    description: game.description,
    imageUrl: game.imageUrl,
    barcode: normalizeProductBarcode(game.barcode),
    releaseDate: game.year,
    // Feed the generic locale-aware title ranking (pickBestRegionalTitle): the
    // FR canonical name is a region-tagged candidate, never a bare title.
    regionalTitles: game.title
      ? [{ region: OKKAZEO_REGION, text: game.title }]
      : undefined,
    attachments: buildOkkazeoAttachments(game),
    facts: buildOkkazeoFacts(game),
  };
}

export function createOkkazeoResolver() {
  return async function fetchFromOkkazeo(
    name: string,
    barcode?: string | null,
  ): Promise<MetadataResult | null> {
    const query = name.trim();
    const normalizedBarcode = normalizeProductBarcode(barcode);
    if (!query && !normalizedBarcode) return null;

    try {
      const hit = await searchOkkazeo(query, normalizedBarcode);
      if (!hit) return null;

      const game = await fetchOkkazeoGame(hit.url);
      const title = game.title;
      if (!title) return null;

      // Trust the result only when the barcode is confirmed by the page's
      // gtin13, or (barcodeless / gtin-less) when the title is a close match —
      // otherwise a loose search hit could mislabel the item.
      const resolvedBarcode = normalizeProductBarcode(game.barcode);
      const barcodeConfirmed =
        !!normalizedBarcode &&
        (!resolvedBarcode || resolvedBarcode === normalizedBarcode);
      const barcodeContradicted =
        !!normalizedBarcode &&
        !!resolvedBarcode &&
        resolvedBarcode !== normalizedBarcode;

      if (barcodeContradicted) return null;

      if (!barcodeConfirmed) {
        if (!query) return null;
        const distance = levenshtein.get(
          query.toLowerCase(),
          title.toLowerCase(),
        );
        if (distance > Math.max(8, query.length * 0.6)) return null;
      }

      return mapOkkazeoMetadata({
        ...game,
        barcode: game.barcode || normalizedBarcode || undefined,
      });
    } catch (error) {
      console.error("[Okkazeo] Metadata lookup failed:", error);
      return null;
    }
  };
}

export { mapOkkazeoMetadata, buildOkkazeoFacts };
