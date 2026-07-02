import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import { fetchBooknodeMetadata, getBooknodeSuggestions } from "./fetch";
import { booknodeCoverDownloadCandidates } from "./coverUrl";

export { fetchBooknodeMetadata, parseBooknodeBookPage } from "./fetch";

function formatBooknodeRating(value: number, count?: number): string {
  const formatted = value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  });
  return count && count > 0
    ? `${formatted}/10 (${count} notes)`
    : `${formatted}/10`;
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

  return {
    title: book.title,
    authors: book.authors?.map((name) => ({ name })),
    description: book.description,
    imageUrl: book.imageUrl,
    regionalTitles: [{ region: "fr", text: book.title }],
    attachments: book.imageUrl
      ? [
          {
            type: "cover",
            url: book.imageUrl,
            role: "fr",
            source: "booknode",
          },
        ]
      : undefined,
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
    capabilities: ["identify", "cover", "description", "rating", "people"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    coverUrlHost: "cdn1.booknode.com/book_cover/",
    remoteImageReferer: "https://booknode.com/",
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
      async resolve({ name, lookupQueries }: any) {
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()];
        for (const query of queries) {
          if (!query?.trim()) continue;
          const metadata = mapBooknodeMetadata(
            await fetchBooknodeMetadata(query.trim()),
          );
          if (metadata) return metadata;
        }
        return null;
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) => getBooknodeSuggestions(cleanedName),
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
  expandCoverDownloadCandidates: booknodeCoverDownloadCandidates,
};
