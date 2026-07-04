import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { bookIdentifierLabel } from "@/lib/barcode/shelfLabels";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { pricedOffers } from "@/lib/provider/priceOffers";

import type { MetadataAttachment, MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type {
  BarcodePriceRefreshContext,
  MetadataProviderAdapter,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchBedethequeMetadata,
  getBedethequeSuggestions,
} from "./fetch";
import { collectBedethequeMappingRawKeys } from "./fetch";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";

export {
  fetchBedethequeMetadata,
  parseBedethequeAlbumPage,
  parseBedethequeSeriesAlbumLinks,
  parseBedethequeSaleListings,
  parseBedethequeRetailPrices,
} from "./fetch";

function formatEuroPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function buildBedethequePriceFacts(
  album: NonNullable<
    Awaited<ReturnType<typeof fetchBedethequeMetadata>>
  >,
): MetadataFact[] {
  const facts: MetadataFact[] = [];

  if (album.retailPrices?.priceNewCents) {
    facts.push({
      kind: "price",
      label: "Neuf dès",
      value: formatEuroPrice(album.retailPrices.priceNewCents),
      source: "bedetheque",
      confidence: 0.64,
      priority: 56,
    });
  }

  const listings = album.saleListings;
  if (!listings?.length) return facts;

  facts.push({
    kind: "price",
    label: "Marketplace dès",
    value: formatEuroPrice(Math.min(...listings.map((entry) => entry.priceCents))),
    source: "bedetheque",
    confidence: 0.62,
    priority: 54,
  });

  for (const listing of listings) {
    const seller = listing.seller || "Vendeur";
    const conditionSuffix = listing.condition ? ` · ${listing.condition}` : "";
    facts.push({
      kind: "price",
      label: `Bédéthèque · ${seller}`,
      value: `${formatEuroPrice(listing.priceCents)}${conditionSuffix}`,
      source: "bedetheque",
      confidence: 0.56,
      priority: 44,
    });
  }

  return facts;
}

const PRICE_SOURCE = "Bedetheque";

async function refreshBedethequeOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "books") return [];

  const queries = Array.from(
    new Set(
      [ctx.primaryName, ...ctx.fallbackNames, ctx.cleanedBarcode].filter(
        (query) => query?.trim(),
      ),
    ),
  );
  const normalizedBarcode = ctx.cleanedBarcode
    ? normalizeProductBarcode(ctx.cleanedBarcode)
    : undefined;

  for (const query of queries) {
    const album = await fetchBedethequeMetadata(query, {
      barcode: normalizedBarcode,
    });
    if (!album) continue;

    const rows: Array<{
      condition: string;
      priceCents: number;
      rawValue: unknown;
      extra?: {
        productName?: string | null;
        merchantName?: string | null;
        sourceUrl?: string | null;
      };
    }> = [];

    if (album.retailPrices?.priceNewCents) {
      rows.push({
        condition: "new",
        priceCents: album.retailPrices.priceNewCents,
        rawValue: album.retailPrices,
        extra: {
          productName: album.title,
          sourceUrl: album.sourceUrl,
          merchantName: "BDfugue",
        },
      });
    }

    for (const listing of album.saleListings ?? []) {
      rows.push({
        condition: "used",
        priceCents: listing.priceCents,
        rawValue: listing,
        extra: {
          productName: album.title,
          sourceUrl: album.sourceUrl,
          merchantName: listing.seller ?? "Bédéthèque",
        },
      });
    }

    if (rows.length === 0) continue;
    return pricedOffers(PRICE_SOURCE, rows);
  }

  return [];
}

function bedethequeMediaAttachmentType(
  mediaKind: string,
): MetadataAttachment["type"] {
  const normalized = mediaKind.toLowerCase();
  if (normalized === "couvertures") return "cover";
  return "image";
}

function buildBedethequeAttachments(
  album: NonNullable<Awaited<ReturnType<typeof fetchBedethequeMetadata>>>,
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];
  const seen = new Set<string>();

  const push = (attachment: MetadataAttachment) => {
    if (seen.has(attachment.url)) return;
    seen.add(attachment.url);
    attachments.push(attachment);
  };

  if (album.imageUrl) {
    push({
      type: "cover",
      url: album.imageUrl,
      role: "fr",
      source: "bedetheque",
    });
  }

  for (const item of album.media ?? []) {
    push({
      type: bedethequeMediaAttachmentType(item.mediaKind),
      url: item.url,
      role: item.mediaKind.toLowerCase(),
      source: "bedetheque",
    });
  }

  return attachments.length > 0 ? attachments : undefined;
}

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

  facts.push(...buildBedethequePriceFacts(album));

  return {
    title: album.title,
    authors: album.authors?.map((name) => ({ name })),
    publishers: album.publisher ? [{ name: album.publisher }] : undefined,
    releaseDate: album.releaseYear ? String(album.releaseYear) : undefined,
    imageUrl: album.imageUrl,
    barcode: album.barcode,
    aliases: album.alternateTitles?.length ? album.alternateTitles : undefined,
    regionalTitles: [{ region: "fr", text: album.title }],
    attachments: buildBedethequeAttachments(album),
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
    capabilities: ["identify", "cover", "rating", "people", "releaseDate", "price"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "fr",
    coverUrlHost: "bedetheque.com/media/Couvertures/",
    remoteImageReferer: "https://www.bedetheque.com/",
    remoteImageFallback: true,
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
  healthCheck: createMetadataHealthCheck(
    "bedetheque",
    "Bédéthèque",
    async () => {
      const start = Date.now();
      const isUp = await pingUrl("https://www.bedetheque.com/");
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
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
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Super Picsou Géant n°7",
    });
    return collectBedethequeMappingRawKeys(ctx.name);
  },
  refreshBarcodePriceOffers: refreshBedethequeOffers,
};
