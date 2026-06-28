import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { bookIdentifierLabel } from "@/lib/barcode/shelfLabels";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { metadataProbe } from "@/lib/dev/mappingProbe";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import { fetchBedethequeMetadata, getBedethequeSuggestions } from "./fetch";

export {
  fetchBedethequeMetadata,
  parseBedethequeAlbumPage,
  parseBedethequeSeriesAlbumLinks,
} from "./fetch";

function mapBedethequeMetadata(
  album: Awaited<ReturnType<typeof fetchBedethequeMetadata>>,
): MetadataResult | null {
  if (!album?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: "Bédéthèque",
      value: "Voir la fiche",
      url: album.sourceUrl,
      source: "bedetheque",
      confidence: 0.68,
      priority: 36,
    },
  ];

  if (album.publisher) {
    facts.push({
      kind: "publisher",
      label: "Éditeur",
      value: album.publisher,
      source: "bedetheque",
      confidence: 0.62,
      priority: 24,
    });
  }

  const normalizedBarcode = normalizeProductBarcode(album.barcode);
  if (normalizedBarcode) {
    facts.push({
      kind: "identifier",
      label: bookIdentifierLabel(normalizedBarcode),
      value: normalizedBarcode,
      source: "bedetheque",
      confidence: 0.66,
      priority: 40,
    });
  }

  if (album.releaseYear) {
    facts.push({
      kind: "release-date",
      label: "Parution",
      value: String(album.releaseYear),
      source: "bedetheque",
      confidence: 0.6,
      priority: 22,
    });
  }

  if (album.ratingValue) {
    facts.push({
      kind: "rating",
      label: "Bédéthèque",
      value:
        album.ratingCount && album.ratingCount > 0
          ? `${album.ratingValue}/5 (${album.ratingCount} votes)`
          : `${album.ratingValue}/5`,
      source: "bedetheque",
      confidence: 0.58,
      priority: 20,
    });
  }

  if (album.seriesName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: album.seriesPosition
        ? `${album.seriesName} n°${album.seriesPosition}`
        : album.seriesName,
      url: album.seriesUrl,
      source: "bedetheque",
      confidence: 0.64,
      priority: 30,
    });
  }

  return {
    title: album.title,
    authors: album.authors?.map((name) => ({ name })),
    publishers: album.publisher ? [{ name: album.publisher }] : undefined,
    releaseDate: album.releaseYear ? String(album.releaseYear) : undefined,
    imageUrl: album.imageUrl,
    barcode: album.barcode,
    aliases: album.alternateTitles?.length ? album.alternateTitles : undefined,
    regionalTitles: [{ region: "fr", text: album.title }],
    attachments: album.imageUrl
      ? [
          {
            type: "cover",
            url: album.imageUrl,
            role: "fr",
            source: "bedetheque",
          },
        ]
      : undefined,
    facts,
    externalIds: { bedetheque: album.id },
  };
}

export const bedethequeModule: ProviderModule = {
  info: {
    id: "bedetheque",
    label: "Bédéthèque",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "rating",
      "people",
      "releaseDate",
    ],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    coverUrlHost: "bedetheque.com/media/Couvertures/",
    remoteImageReferer: "https://www.bedetheque.com/",
    websiteUrl: "https://www.bedetheque.com/",
    bookCoverPriority: "primary",
    requiresTitleAlignment: true,
    notes:
      "Encyclopédie BD FR (BDGest). Recherche par titre/série ; l'EAN est validé quand présent sur la fiche. Pas de lookup ISBN seul côté site.",
  },
  evidence: {
    label: "Bedetheque",
    sourceWeight: 0.36,
    cleanCachedNames: true,
  },
  createMetadataAdapter() {
    return {
      id: "bedetheque",
      async resolve({
        name,
        barcode,
        lookupQueries,
      }: {
        name?: string | null;
        barcode?: string | null;
        lookupQueries?: string[];
      }) {
        const queries =
          lookupQueries && lookupQueries.length > 0
            ? lookupQueries
            : [String(name || "").trim()];
        const normalizedBarcode = normalizeProductBarcode(barcode);
        for (const query of queries) {
          if (!query?.trim() && !normalizedBarcode) continue;
          const metadata = mapBedethequeMetadata(
            await fetchBedethequeMetadata(query.trim(), {
              barcode: normalizedBarcode,
            }),
          );
          if (metadata) return metadata;
        }
        return null;
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) =>
    getBedethequeSuggestions(cleanedName),
  healthCheck: createMetadataHealthCheck("bedetheque", "Bédéthèque", async () => {
    const start = Date.now();
    const isUp = await pingUrl("https://www.bedetheque.com/");
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "bedetheque-metadata": {
      label: "Bédéthèque - Metadata",
      kind: "metadata",
      run: (query) => fetchBedethequeMetadata(query),
    },
    "bedetheque-barcode": {
      label: "Bédéthèque - Titre + ISBN",
      kind: "metadata",
      run: (query) =>
        fetchBedethequeMetadata("Astérix le Gaulois", { barcode: query }),
    },
  },
  mappingProbe: {
    sampleInput: "Super Picsou Géant n°7",
    context: { name: "Super Picsou Géant n°7" },
  },
  runMappingProbe: async () =>
    metadataProbe(
      mapBedethequeMetadata(
        await fetchBedethequeMetadata("Super Picsou Géant n°7"),
      ),
    ),
};
