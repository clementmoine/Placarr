import {
  acceptRetailerCatalogCandidate,
  retailerSearchHitLimit,
} from "@/core/commerce/retailer/metadataLookup";
import { detectPlatformKey } from "@/core/identify/query";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type { MetadataAdapterContext } from "@/types/providerModule";
import type {
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";

import {
  fetchFullSetItem,
  searchFullSet,
  type FullSetItem,
  type FullSetSearchHit,
} from "./fetch";

const FULLSET_REGION = "fr";
/** Search cards for actual games (vs consoles/accessories/magazines). */
const GAME_CATEGORY = /^jeux/i;
/** Console / accessory SKUs on Full Set (hardware shelves). */
const HARDWARE_CATEGORY = /^(consoles|accessoires)/i;

export function fullSetCategoryMatchesMediaType(
  category: string | undefined,
  mediaType: string | null | undefined,
): boolean {
  if (!category?.trim()) return true;
  if (mediaType === "hardware") return HARDWARE_CATEGORY.test(category);
  return GAME_CATEGORY.test(category);
}

function buildFullSetFacts(item: FullSetItem): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Full Set",
      value: "Voir la fiche",
      url: item.productUrl,
      source: "fullset",
      confidence: 0.72,
      priority: 40,
    },
  ];

  if (item.medianPrice) {
    const listings =
      item.listingCount != null && item.listingCount > 0
        ? ` (${item.listingCount} annonces)`
        : "";
    facts.push({
      kind: "price",
      label: "Cote médiane",
      value: `${item.medianPrice}${listings}`,
      url: item.productUrl,
      source: "fullset",
      confidence: 0.6,
      priority: 58,
    });
  }

  if (item.rarityScore != null) {
    facts.push({
      kind: "rarity",
      label: "Rareté",
      value: `${item.rarityScore}/100`,
      url: item.productUrl,
      source: "fullset",
      confidence: 0.62,
      priority: 64,
    });
  }

  if (item.genre) {
    facts.push({
      kind: "genre",
      label: "Genre",
      value: item.genre,
      source: "fullset",
      confidence: 0.66,
      priority: 60,
    });
  }

  if (item.releaseYear) {
    facts.push({
      kind: "release-year",
      label: "Année",
      value: item.releaseYear,
      source: "fullset",
      confidence: 0.66,
      priority: 58,
    });
  }

  if (item.developer) {
    facts.push({
      kind: "developer",
      label: "Développeur",
      value: item.developer,
      source: "fullset",
      confidence: 0.64,
      priority: 54,
    });
  }

  if (item.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: item.publisher,
      source: "fullset",
      confidence: 0.64,
      priority: 54,
    });
  }

  return facts;
}

function buildFullSetObservations(
  item: FullSetItem,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = ["title_match"];

  return observationsFromMetadataResult(metadata, {
    providerId: "fullset",
    providerLabel: "Full Set",
    sourceDocumentRole: "catalog_product",
    sourceUrl: item.productUrl,
    evidenceSignals,
    titleRole: "catalog_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    language: FULLSET_REGION,
  });
}

/**
 * Full Set item pages carry no clean cover: the gallery is eBay listing
 * photos (robots-disallowed under /visuel/, and sometimes of a different
 * game), so this provider deliberately emits facts only — no attachments.
 */
export function mapFullSetMetadata(item: FullSetItem): MetadataResult {
  const metadata: MetadataResult = {
    title: item.title,
    releaseDate: item.releaseYear,
    regionalTitles: [{ region: FULLSET_REGION, text: item.title }],
    facts: buildFullSetFacts(item),
  };

  return {
    ...metadata,
    observations: buildFullSetObservations(item, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function fullSetHitPlatformKey(hit: FullSetSearchHit): string | null {
  return (
    detectPlatformKey(hit.platformLabel ?? "") ??
    detectPlatformKey(hit.consoleSlug?.replace(/_/g, " ") ?? "")
  );
}

export function fullSetHitMatchesPlatform(
  hit: FullSetSearchHit,
  requestedPlatformKey: string | null,
): boolean {
  if (!requestedPlatformKey) return true;
  const hitKey = fullSetHitPlatformKey(hit);
  // A console shelf must not adopt another console's price/rarity: an
  // unresolvable card platform is skipped rather than trusted.
  return hitKey === requestedPlatformKey;
}

export function createFullSetResolver() {
  return async function fetchFromFullSet(
    ctx: MetadataAdapterContext,
  ): Promise<MetadataResult | null> {
    const requestedName = ctx.name.trim();
    // Full Set is not EAN-addressable: name search only.
    if (!requestedName) return null;

    const requestedPlatformKey =
      detectPlatformKey(ctx.platform ?? "") ??
      detectPlatformKey(ctx.shelfName ?? "");

    const queries =
      ctx.lookupQueries && ctx.lookupQueries.length > 0
        ? ctx.lookupQueries
        : [requestedName];

    try {
      const seenUrls = new Set<string>();

      for (const query of queries) {
        const cleanedQuery = query.trim();
        if (!cleanedQuery) continue;

        const hitLimit = retailerSearchHitLimit({
          requestedName,
          searchQuery: cleanedQuery,
          shelfName: ctx.shelfName,
        });

        const hits = await searchFullSet(cleanedQuery, {
          limit: hitLimit,
          signal: ctx.signal,
        });

        for (const hit of hits) {
          if (seenUrls.has(hit.url)) continue;
          seenUrls.add(hit.url);

          if (!fullSetCategoryMatchesMediaType(hit.category, ctx.type)) continue;
          // Console SKUs are the product; platformKey on the card is the
          // console family — only enforce for game shelves.
          if (
            ctx.type !== "hardware" &&
            !fullSetHitMatchesPlatform(hit, requestedPlatformKey)
          ) {
            continue;
          }

          if (
            !acceptRetailerCatalogCandidate({
              requestedName,
              searchQuery: cleanedQuery,
              shelfName: ctx.shelfName,
              catalogTitle: hit.title,
              barcodeConfirmed: false,
            })
          ) {
            continue;
          }

          const item = await fetchFullSetItem(hit.url, ctx.signal);
          if (!item?.title) continue;

          return mapFullSetMetadata(item);
        }
      }

      return null;
    } catch (error) {
      console.error("[FullSet] Metadata lookup failed:", error);
      return null;
    }
  };
}
