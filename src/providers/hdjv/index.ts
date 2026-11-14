import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { collectObjectMappingSignals } from "@/lib/dev/scrapeMappingSignals";
import { probeContextOrDefault } from "@/lib/dev/mappingRawKeys";
import { stripLegalMarkSymbols } from "@/core/enrich/search/query";
import { defineProvider } from "@/providers/shared/defineProvider";
import type { MetadataResult } from "@/types/metadataProvider";
import {
  normalizeVideoGamePlatformKey,
  resolveGameAttachmentPlatformKey,
  withMetadataPlatformKeys,
} from "@/core/enrich/media/platformKeyStamp";
import { deriveAttachmentPlatformKeyFromUrl } from "@/core/enrich/media/attachmentDisplayScore";

import { fetchFromHdjv, fetchHdjvGallery, pingHdjv } from "./fetch";

export { fetchFromHdjv, fetchHdjvGallery, pingHdjv } from "./fetch";

function galleryToMetadata(
  gallery: NonNullable<Awaited<ReturnType<typeof fetchHdjvGallery>>>,
  platform?: string | null,
): MetadataResult {
  const facts: NonNullable<MetadataResult["facts"]> = [];

  if (gallery.players) {
    facts.push({
      kind: "players",
      label: "Players",
      value: gallery.players,
      source: "hdjv",
      confidence: 0.7,
      priority: 62,
    });
  }

  const platformKey =
    normalizeVideoGamePlatformKey(gallery.platformLabel) ??
    resolveGameAttachmentPlatformKey({
      requestedPlatform: platform ?? gallery.platformLabel,
      title: gallery.title,
      productUrl: gallery.ficheUrl,
    });

  return withMetadataPlatformKeys(
    {
      title: gallery.title,
      barcode: gallery.barcode || undefined,
      imageUrl: gallery.coverUrl || undefined,
      releaseDate: gallery.releaseDate || undefined,
      aliases: gallery.alternateTitle ? [gallery.alternateTitle] : undefined,
      attachments: gallery.items.map((item) => ({
        type: item.type,
        url: item.url,
        source: "hdjv",
        ...(item.role ? { role: item.role } : {}),
        title: item.label,
        platformKey:
          deriveAttachmentPlatformKeyFromUrl(item.url) ??
          platformKey ??
          undefined,
      })),
      facts: facts.length > 0 ? facts : undefined,
      externalIds: gallery.gameCode ? { hdjv: gallery.gameCode } : undefined,
    },
    platformKey,
  );
}

export const hdjvModule = defineProvider({
  info: {
    id: "hdjv",
    label: "HDJV",
    factLabel: "HDJV",
    types: ["games"],
    capabilities: [
      "identify",
      "cover",
      "screenshots",
      "releaseDate",
      "players",
    ],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    isSecondary: true,
    requiresTitleAlignment: true,
    defaultLanguage: "fr",
    gameMediaGallerySource: true,
    isRealBoxCover: true,
    coverDefaultRegion: "fr",
    imageScoreAdjustment: 140,
    coverUrlHost: "historiquedesjeuxvideo.com",
    remoteImageReferer: "https://www.historiquedesjeuxvideo.com/",
    websiteUrl: "https://www.historiquedesjeuxvideo.com/",
    notes:
      "Historique des Jeux Video — scans FR de jaquettes (recto/verso) et screenshots.",
  },
  createMetadataAdapter: () => ({
    id: "hdjv",
    async resolve({ name, platform, lookupQueries, barcode }) {
      const fallback = stripLegalMarkSymbols(name.trim()) || name.trim();
      const queries = lookupQueries?.length ? lookupQueries : [fallback];
      const gallery = await fetchHdjvGallery(
        queries,
        platform ?? undefined,
        barcode ?? undefined,
        [name, ...queries],
      );
      return gallery ? galleryToMetadata(gallery, platform) : null;
    },
  }),
  healthCheck: createMetadataHealthCheck("hdjv", "HDJV", async () => {
    const start = Date.now();
    const isUp = await pingHdjv();
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "hdjv-metadata": {
      label: "HDJV - Metadata",
      kind: "metadata",
      run: (query) => fetchFromHdjv(query),
    },
  },
  mappingProbe: {
    sampleInput: "Le Parrain 2",
    context: {
      name: "Le Parrain 2",
      platform: "xbox360",
    },
  },
  runMappingProbe: async () => {
    const gallery = await fetchFromHdjv("Le Parrain 2", "xbox360");
    return metadataProbe(gallery ? galleryToMetadata(gallery) : null);
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Le Parrain 2",
      platform: "xbox360",
    });
    const gallery = await fetchFromHdjv(ctx.name, ctx.platform ?? undefined);
    return collectObjectMappingSignals(
      gallery ? galleryToMetadata(gallery) : null,
    );
  },
});
