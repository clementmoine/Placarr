import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { bookIdentifierLabel } from "@/core/identify/shelfLabels";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { throwIfAborted } from "@/lib/http/abort";
import { pricedOffers } from "@/core/catalog/priceOffers";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";
import { matchBarcodes } from "@/core/catalog/matchContext";

import { fetchBooknodeMetadata, getBooknodeSuggestions } from "./fetch";
import type { BooknodePriceOffer } from "./fetch";
import { collectBooknodeMappingRawKeys } from "./fetch";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import {
  booknodeCoverDownloadCandidates,
  booknodeCoverMediaKey,
  normalizeBooknodeCoverUrl,
} from "./coverUrl";
import { pinnedProviderRecordUrl } from "@/providers/shared/pinnedRecord";

export {
  fetchBooknodeMetadata,
  parseBooknodeBookPage,
  parseBooknodePriceOffers,
} from "./fetch";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function booknodePriceFactLabel(offer: BooknodePriceOffer): string {
  const condition =
    offer.condition === "new"
      ? "neuf"
      : offer.condition === "used"
        ? "occasion"
        : null;
  return condition ? `${offer.retailer} (${condition})` : offer.retailer;
}

function buildBooknodePriceFacts(
  offers: BooknodePriceOffer[] | undefined,
): MetadataFact[] {
  if (!offers?.length) return [];

  const facts: MetadataFact[] = [];
  const newPrices = offers
    .filter((offer) => offer.condition === "new")
    .map((offer) => offer.priceCents);
  const usedPrices = offers
    .filter((offer) => offer.condition === "used")
    .map((offer) => offer.priceCents);

  if (newPrices.length > 0) {
    facts.push({
      kind: "price",
      label: "Neuf dès",
      value: formatEuroPrice(Math.min(...newPrices)),
      source: "booknode",
      confidence: 0.64,
      priority: 54,
    });
  }
  if (usedPrices.length > 0) {
    facts.push({
      kind: "price",
      label: "Occasion dès",
      value: formatEuroPrice(Math.min(...usedPrices)),
      source: "booknode",
      confidence: 0.62,
      priority: 52,
    });
  }

  for (const offer of offers) {
    facts.push({
      kind: "price",
      label: booknodePriceFactLabel(offer),
      value: formatEuroPrice(offer.priceCents),
      url: offer.url,
      source: "booknode",
      confidence: 0.58,
      priority: 46,
    });
  }

  return facts;
}

function formatBooknodeRating(value: number, count?: number): string {
  const formatted = value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  });
  return count && count > 0
    ? `${formatted}/10 (${count} notes)`
    : `${formatted}/10`;
}

const PRICE_SOURCE = "Booknode";

function booknodePriceCondition(
  condition: BooknodePriceOffer["condition"],
): string | null {
  if (condition === "new") return "new";
  if (condition === "used") return "used";
  return null;
}

async function refreshBooknodeOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];

  const queries = Array.from(
    new Set(
      [ctx.primaryName, ...ctx.fallbackNames, ...matchBarcodes(ctx)].filter(
        (query) => query?.trim(),
      ),
    ),
  );

  for (const query of queries) {
    const book = await fetchBooknodeMetadata(query);
    if (!book?.priceOffers?.length) continue;

    return pricedOffers(
      PRICE_SOURCE,
      book.priceOffers.flatMap((offer) => {
        const condition = booknodePriceCondition(offer.condition);
        if (!condition) return [];
        return [
          {
            condition,
            priceCents: offer.priceCents,
            rawValue: offer,
            extra: {
              productName: book.title,
              merchantName: offer.retailer,
              sourceUrl: offer.url,
            },
          },
        ];
      }),
    );
  }

  return [];
}

/**
 * Fiche Booknode: only the featured cover (`imageUrl`) is a real `cover`
 * (jaquette). Extra uploads from `/covers` are community alternates — keep
 * them as `image` so the Affiche picker does not label every variant « Jaquette ».
 */
function buildBooknodeAttachments(
  book: NonNullable<Awaited<ReturnType<typeof fetchBooknodeMetadata>>>,
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];
  const seenMediaKeys = new Set<string>();

  const push = (url: string, type: "cover" | "image") => {
    const normalized = normalizeBooknodeCoverUrl(url);
    if (!normalized) return;
    const mediaKey = booknodeCoverMediaKey(normalized) || normalized;
    if (seenMediaKeys.has(mediaKey)) return;
    seenMediaKeys.add(mediaKey);
    attachments.push({
      type,
      url: normalized,
      title: book.title,
      ...(type === "cover" ? { role: "fr" as const } : {}),
      source: "booknode",
    });
  };

  if (book.imageUrl) push(book.imageUrl, "cover");
  for (const url of book.coverImages ?? []) {
    push(url, "image");
  }

  return attachments.length > 0 ? attachments : undefined;
}

/** @internal exported for unit tests */
export function mapBooknodeMetadata(
  book: Awaited<ReturnType<typeof fetchBooknodeMetadata>>,
): MetadataResult | null {
  if (!book?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Booknode",
      value: "Voir la fiche",
      url: book.sourceUrl,
      source: "booknode",
      confidence: 0.66,
      priority: 34,
    },
  ];

  if (book.genres?.length) {
    for (const theme of book.genres) {
      const trimmed = theme.trim();
      if (!trimmed) continue;
      facts.push({
        kind: "tag",
        label: "Thème",
        value: trimmed,
        source: "booknode",
        confidence: 0.58,
        priority: 26,
      });
    }
  }
  if (book.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: book.publisher,
      source: "booknode",
      confidence: 0.6,
      priority: 24,
    });
  }
  if (book.ratingValue) {
    facts.push({
      kind: "rating",
      label: "Booknode",
      value: formatBooknodeRating(book.ratingValue, book.ratingCount),
      source: "booknode",
      confidence: 0.62,
      priority: 52,
    });
  } else {
    const socialParts: string[] = [];
    if (book.ratingCount) socialParts.push(`${book.ratingCount} notes`);
    if (book.reviewCount) socialParts.push(`${book.reviewCount} commentaires`);
    if (socialParts.length) {
      facts.push({
        kind: "popularity",
        label: "Booknode",
        value: socialParts.join(" • "),
        source: "booknode",
        confidence: 0.52,
        priority: 18,
      });
    }
  }
  if (book.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: book.seriesName,
      url: book.seriesUrl,
      source: "booknode",
      confidence: 0.64,
      priority: 30,
    });
  }
  if (book.seriesPosition != null) {
    facts.push({
      kind: "tag",
      label: "Tome",
      value: String(book.seriesPosition),
      source: "booknode",
      confidence: 0.6,
      priority: 28,
    });
  }
  if (book.barcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(book.barcode),
      value: book.barcode,
      source: "booknode",
      confidence: 0.64,
      priority: 40,
    });
  }
  if (book.releaseDate) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: book.releaseDate,
      source: "booknode",
      confidence: 0.58,
      priority: 22,
    });
  }

  facts.push(...buildBooknodePriceFacts(book.priceOffers));

  const metadata: MetadataResult = {
    title: book.title,
    authors: book.authors?.map((name) => ({ name })),
    publishers: book.publisher ? [{ name: book.publisher }] : undefined,
    description: book.description,
    releaseDate: book.releaseDate,
    pageCount: book.pageCount,
    imageUrl: book.imageUrl,
    barcode: book.barcode,
    regionalTitles: [{ region: "fr", text: book.title }],
    attachments: buildBooknodeAttachments(book),
    facts,
    externalIds: book.id ? { booknode: book.id } : undefined,
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: "booknode",
      providerLabel: "Booknode",
      sourceDocumentRole: "reference_record",
      sourceUrl: book.sourceUrl,
      sourceId: book.id,
      evidenceSignals: book.barcode
        ? ["structured_data", "barcode_match"]
        : ["structured_data", "title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: "fr",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export const booknodeModule = defineProvider({
  info: {
    id: "booknode",
    label: "Booknode",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "people",
      "price",
      "releaseDate",
      "pageCount",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "cdn1.booknode.com/book_cover/",
    remoteImageReferer: "https://booknode.com/",
    remoteImageFallback: true,
    remoteImageFlareTimeoutMs: 20_000,
    bookCoverPriority: "primary",
    bookGallerySource: true,
    requiresTitleAlignment: true,
    websiteUrl: "https://booknode.com/",
    notes:
      "Fiches livres communautaires FR; seule la couverture de la fiche est typée `cover` (jaquette), les variantes `/covers` restent en `image`. Prefetch `/mod11/` webp puis upgrade async `/full/` JPEG dans `/uploads/`.",
  },
  evidence: {
    label: "Booknode",
    sourceWeight: 0.34,
    cleanCachedNames: true,
  },
  parseMetadataRecordIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!/booknode\.com$/i.test(parsed.hostname.replace(/^www\./i, ""))) {
        return null;
      }
      return (
        parsed.pathname.match(/(?:_|media\/)(\d+)(?:[/?#]|$)/)?.[1] ?? null
      );
    } catch {
      return null;
    }
  },
  createMetadataAdapter() {
    return {
      id: "booknode",
      async resolve(ctx) {
        const pinnedUrl = pinnedProviderRecordUrl(ctx, "booknode");
        if (pinnedUrl) {
          throwIfAborted(ctx.signal);
          const pinned = mapBooknodeMetadata(
            await fetchBooknodeMetadata(pinnedUrl, ctx.signal),
          );
          if (pinned) return pinned;
        }

        const queries =
          ctx.lookupQueries && ctx.lookupQueries.length > 0
            ? ctx.lookupQueries
            : [String(ctx.name || "").trim()];
        for (const query of queries) {
          if (!query?.trim()) continue;
          throwIfAborted(ctx.signal);
          const metadata = mapBooknodeMetadata(
            await fetchBooknodeMetadata(query.trim(), ctx.signal),
          );
          if (metadata) return metadata;
        }
        return null;
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) =>
    getBooknodeSuggestions(cleanedName),
  healthCheck: createMetadataHealthCheck("booknode", "Booknode", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://booknode.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "booknode-metadata": {
      label: "Booknode - Metadata",
      kind: "metadata",
      run: (query) => fetchBooknodeMetadata(query),
    },
  },
  mappingProbe: {
    sampleInput: "Super Picsou Géant n°1",
    context: { name: "Super Picsou Géant n°1" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBooknodeMetadata(
        await fetchBooknodeMetadata("Super Picsou Géant n°1"),
      ),
    ),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Super Picsou Géant n°1",
    });
    return collectBooknodeMappingRawKeys(ctx.name);
  },
  expandCoverDownloadCandidates: booknodeCoverDownloadCandidates,
  localizeCoverDownload: async (url, options) => {
    const { downloadBooknodeCoverImage } = await import("./coverDownload");
    return downloadBooknodeCoverImage(url, options);
  },
  refreshBarcodePriceOffers: refreshBooknodeOffers,
});
