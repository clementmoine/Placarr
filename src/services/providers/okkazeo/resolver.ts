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

import { fetchOkkazeoGame, searchOkkazeoHits, type OkkazeoGame } from "./fetch";

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

function buildOkkazeoObservations(
  game: OkkazeoGame,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (metadata.barcode) evidenceSignals.push("barcode_match");

  const observations = observationsFromMetadataResult(metadata, {
    providerId: "okkazeo",
    providerLabel: "Okkazeo",
    sourceDocumentRole: "catalog_product",
    sourceUrl: game.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: OKKAZEO_REGION,
  });

  if (game.priceCents != null && Number.isFinite(game.priceCents)) {
    observations.push({
      kind: "offer",
      role: "price_snapshot",
      priceCents: game.priceCents,
      currency: "EUR",
      provenance: {
        providerId: "okkazeo",
        providerLabel: "Okkazeo",
        sourceDocumentRole: "offer",
        sourceUrl: game.productUrl,
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

function mapOkkazeoMetadata(game: OkkazeoGame): MetadataResult {
  const metadata: MetadataResult = {
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
  return {
    ...metadata,
    observations: buildOkkazeoObservations(game, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function createOkkazeoResolver() {
  return async function fetchFromOkkazeo(
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

      for (const query of queries) {
        if (!query && !normalizedBarcode) continue;

        const hitLimit = retailerSearchHitLimit({
          requestedName,
          searchQuery: query,
          shelfName: ctx.shelfName,
        });

        const hits = await searchOkkazeoHits(query, normalizedBarcode, hitLimit);
        for (const hit of hits) {
          if (seenUrls.has(hit.url)) continue;
          seenUrls.add(hit.url);

          let game: OkkazeoGame;
          try {
            game = await fetchOkkazeoGame(hit.url);
          } catch {
            continue;
          }
          const title = game.title;
          if (!title) continue;

          const resolvedBarcode = normalizeProductBarcode(game.barcode);
          const barcodeConfirmed =
            !!normalizedBarcode &&
            (!resolvedBarcode || resolvedBarcode === normalizedBarcode);
          const barcodeContradicted =
            !!normalizedBarcode &&
            !!resolvedBarcode &&
            resolvedBarcode !== normalizedBarcode;

          if (barcodeContradicted) continue;

          if (
            !acceptRetailerCatalogCandidate({
              requestedName,
              searchQuery: query,
              shelfName: ctx.shelfName,
              catalogTitle: title,
              catalogAliases: game.listingTitles,
              barcodeConfirmed,
            })
          ) {
            continue;
          }

          return mapOkkazeoMetadata({
            ...game,
            barcode: game.barcode || normalizedBarcode || undefined,
          });
        }
      }

      return null;
    } catch (error) {
      console.error("[Okkazeo] Metadata lookup failed:", error);
      return null;
    }
  };
}

export { mapOkkazeoMetadata, buildOkkazeoFacts, buildOkkazeoObservations };
