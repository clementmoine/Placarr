import {
  acceptRetailerCatalogCandidate,
  retailerSearchHitLimit,
} from "@/core/commerce/retailer/metadataLookup";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { retailerProductUrlBarcodeConflicts } from "@/core/commerce/retailer/productUrl";
import { normalizeBoardGamePlayerCount } from "@/core/enrich/boardGame";
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
import type {
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";

import { fetchMyLudoGame, searchMyLudoHits, type MyLudoGame } from "./fetch";

const MYLUDO_REGION = "fr";

function buildMyLudoFacts(game: MyLudoGame): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "MyLudo",
      value: "Voir la fiche",
      url: game.productUrl,
      source: "myludo",
      confidence: 0.72,
      priority: 40,
    },
  ];

  if (game.players) {
    facts.push({
      kind: "players",
      label: "Joueurs",
      value: normalizeBoardGamePlayerCount(game.players),
      source: "myludo",
      confidence: 0.76,
      priority: 88,
    });
  }

  if (game.playtime) {
    facts.push({
      kind: "playtime",
      label: "Durée d'une partie",
      value: game.playtime,
      source: "myludo",
      confidence: 0.74,
      priority: 86,
    });
  }

  if (game.ageRating) {
    facts.push({
      kind: "age-rating",
      label: "Âge recommandé",
      value: game.ageRating,
      source: "myludo",
      confidence: 0.72,
      priority: 74,
    });
  }

  if (game.year) {
    facts.push({
      kind: "release-year",
      label: "Année",
      value: game.year,
      source: "myludo",
      confidence: 0.7,
      priority: 60,
    });
  }

  return facts;
}

function buildMyLudoAttachments(
  game: MyLudoGame,
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];

  if (game.imageUrl) {
    attachments.push({
      type: "cover",
      url: game.imageUrl,
      role: MYLUDO_REGION,
      source: "myludo",
    });
  }

  for (const url of game.mediaImages ?? []) {
    attachments.push({
      type: "image",
      url,
      role: MYLUDO_REGION,
      source: "myludo",
      coverProvenance: "user_photo",
    });
  }

  return attachments.length > 0 ? attachments : undefined;
}

function buildMyLudoObservations(
  game: MyLudoGame,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];

  return observationsFromMetadataResult(metadata, {
    providerId: "myludo",
    providerLabel: "MyLudo",
    sourceDocumentRole: "catalog_product",
    sourceUrl: game.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: MYLUDO_REGION,
  });
}

export function mapMyLudoMetadata(game: MyLudoGame): MetadataResult {
  const metadata: MetadataResult = {
    title: game.title,
    description: game.description,
    imageUrl: game.imageUrl,
    releaseDate: game.year,
    regionalTitles: game.title
      ? [{ region: MYLUDO_REGION, text: game.title }]
      : undefined,
    aliases: game.listingTitles?.length ? game.listingTitles : undefined,
    attachments: buildMyLudoAttachments(game),
    facts: buildMyLudoFacts(game),
  };

  return {
    ...metadata,
    observations: buildMyLudoObservations(game, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function createMyLudoResolver() {
  return async function fetchFromMyLudo(
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

        const hits = await searchMyLudoHits(query, normalizedBarcode, hitLimit);
        for (const hit of hits) {
          if (seenUrls.has(hit.url)) continue;
          seenUrls.add(hit.url);

          let game: MyLudoGame;
          try {
            game = await fetchMyLudoGame(hit.url);
          } catch {
            continue;
          }
          const title = game.title;
          if (!title) continue;

          const barcodeConfirmed = !!normalizedBarcode;
          if (
            normalizedBarcode &&
            retailerProductUrlBarcodeConflicts(hit.url, normalizedBarcode)
          ) {
            continue;
          }

          const listingTitles = [
            ...(game.listingTitles ?? []),
            ...(hit.title ? [hit.title] : []),
          ];

          if (
            !acceptRetailerCatalogCandidate({
              requestedName,
              searchQuery: query,
              shelfName: ctx.shelfName,
              catalogTitle: title,
              catalogAliases: listingTitles,
              barcodeConfirmed,
              trustConfirmedProductBarcode: barcodeConfirmed,
              itemBarcode: normalizedBarcode,
            })
          ) {
            continue;
          }

          return mapMyLudoMetadata({
            ...game,
            listingTitles:
              listingTitles.length > 0 ? listingTitles : game.listingTitles,
          });
        }
      }

      return null;
    } catch (error) {
      console.error("[MyLudo] Metadata lookup failed:", error);
      return null;
    }
  };
}
