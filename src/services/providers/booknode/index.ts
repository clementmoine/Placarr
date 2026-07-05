import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { throwIfAborted } from "@/lib/http/abort";
import { pricedOffers } from "@/lib/provider/priceOffers";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import { fetchBooknodeMetadata, getBooknodeSuggestions } from "./fetch";
import type { BooknodePriceOffer } from "./fetch";
import { collectBooknodeMappingRawKeys } from "./fetch";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import {
  booknodeCoverDownloadCandidates,
  booknodeCoverMediaKey,
  normalizeBooknodeCoverUrl,
} from "./coverUrl";

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
      [ctx.primaryName, ...ctx.fallbackNames, ctx.cleanedBarcode].filter(
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

function buildBooknodeAttachments(
  book: NonNullable<Awaited<ReturnType<typeof fetchBooknodeMetadata>>>,
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];
  const seenMediaKeys = new Set<string>();

  const pushCover = (url: string) => {
    const normalized = normalizeBooknodeCoverUrl(url);
    if (!normalized) return;
    const mediaKey = booknodeCoverMediaKey(normalized) || normalized;
    if (seenMediaKeys.has(mediaKey)) return;
    seenMediaKeys.add(mediaKey);
    attachments.push({
      type: "cover",
      url: normalized,
      role: "fr",
      source: "booknode",
    });
  };

  if (book.imageUrl) pushCover(book.imageUrl);
  for (const url of book.coverImages ?? []) {
    pushCover(url);
  }

  return attachments.length > 0 ? attachments : undefined;
}

function mapBooknodeMetadata(
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
    facts.push({
      kind: "genre",
      label: "Thèmes Booknode",
      value: book.genres.join(" • "),
      source: "booknode",
      confidence: 0.58,
      priority: 26,
    });
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
      value: book.seriesPosition
        ? `${book.seriesName} n°${book.seriesPosition}`
        : book.seriesName,
      url: book.seriesUrl,
      source: "booknode",
      confidence: 0.64,
      priority: 30,
    });
  }

  facts.push(...buildBooknodePriceFacts(book.priceOffers));

  return {
    title: book.title,
    authors: book.authors?.map((name) => ({ name })),
    publishers: book.publisher ? [{ name: book.publisher }] : undefined,
    description: book.description,
    imageUrl: book.imageUrl,
    regionalTitles: [{ region: "fr", text: book.title }],
    attachments: buildBooknodeAttachments(book),
    facts,
    externalIds: book.id ? { booknode: book.id } : undefined,
  };
}

export const booknodeModule: ProviderModule = {
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
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    coverUrlHost: "cdn1.booknode.com/book_cover/",
    remoteImageReferer: "https://booknode.com/",
    remoteImageFallback: true,
    remoteImageFlareTimeoutMs: 20_000,
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    websiteUrl: "https://booknode.com/",
    notes:
      "Fiches livres communautaires FR; couvertures localisées dans /uploads (fallback /mod11/ si /full/ bloque).",
  },
  evidence: {
    label: "Booknode",
    sourceWeight: 0.34,
    cleanCachedNames: true,
  },
  createMetadataAdapter() {
    return {
      id: "booknode",
      async resolve({ name, lookupQueries, signal }) {
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()];
        for (const query of queries) {
          if (!query?.trim()) continue;
          throwIfAborted(signal);
          const metadata = mapBooknodeMetadata(
            await fetchBooknodeMetadata(query.trim(), signal),
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
  refreshBarcodePriceOffers: refreshBooknodeOffers,
};
