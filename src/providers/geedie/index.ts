import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { rawProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

import { structuralCoverDownloadCandidates } from "@/core/enrich/media/coverUrlUpgrades";
import { stripLegalMarkSymbols } from "@/core/enrich/search/query";

import { fetchFromGeedie, fetchGeedieGallery, pingGeedie } from "./fetch";

export { fetchFromGeedie, fetchGeedieGallery, pingGeedie } from "./fetch";

function galleryToMetadata(
  gallery: NonNullable<Awaited<ReturnType<typeof fetchGeedieGallery>>>,
): MetadataResult {
  return {
    title: gallery.title,
    barcode: gallery.barcode || undefined,
    imageUrl: gallery.coverUrl || undefined,
    attachments: gallery.items.map((item) => ({
      type: "cover" as const,
      url: item.coverUrl,
      source: "geedie",
      role: item.role,
      title: item.title,
    })),
    externalIds: gallery.productId ? { geedie: gallery.productId } : undefined,
  };
}

export const geedieModule: ProviderModule = {
  info: {
    id: "geedie",
    label: "Geedie",
    types: ["games"],
    capabilities: ["identify", "cover"],
    auth: { kind: "scrape" },
    canonical: false,
    defaultLanguage: "en",
    isSecondary: true,
    requiresTitleAlignment: true,
    gameMediaGallerySource: true,
    isRealBoxCover: true,
    imageScoreAdjustment: 120,
    retailCatalogImageTitles: true,
    strictShelfPlatformCover: true,
    coverUrlHost: "geedie.lt",
    // `/storage/collectables/` images are a seller's photo of their own used
    // copy (case glare, perspective); `/storage/products/` and the Cloudflare
    // Images CDN serve the clean catalogue render. Provenance, not privilege.
    coverProvenanceRules: {
      userPhoto: ["/storage/collectables/"],
      catalog: ["/storage/products/", "imagedelivery.net"],
    },
    remoteImageReferer: "https://geedie.lt/",
    websiteUrl: "https://geedie.lt/",
    notes: "Photos de boîtes du marketplace Geedie (PS/Xbox/Nintendo).",
  },
  expandCoverDownloadCandidates(url) {
    const candidates = [...structuralCoverDownloadCandidates(url)];
    if (url.includes("/storage/products/") && url.includes("-cover.webp")) {
      const larger = url.replace(/-\d+x\d+-cover\.webp$/, "-cover.webp");
      return [larger, ...candidates.filter((entry) => entry !== larger)];
    }
    return candidates;
  },
  createMetadataAdapter: () => ({
    id: "geedie",
    async resolve({ name, platform, lookupQueries, barcode }) {
      const fallback = stripLegalMarkSymbols(name.trim()) || name.trim();
      const queries = lookupQueries?.length ? lookupQueries : [fallback];
      const gallery = await fetchGeedieGallery(
        queries,
        platform ?? undefined,
        barcode ?? undefined,
      );
      return gallery ? galleryToMetadata(gallery) : null;
    },
  }),
  healthCheck: createMetadataHealthCheck("geedie", "Geedie", async () => {
    const start = Date.now();
    const isUp = await pingGeedie();
    return {
      ok: isUp,
      latency: Date.now() - start,
      error: isUp ? null : "Host unreachable",
    };
  }),
  testHandlers: {
    "geedie-metadata": {
      label: "Geedie - Metadata",
      kind: "metadata",
      run: (query) => fetchFromGeedie(query),
    },
  },
  mappingProbe: {
    sampleInput: "Trine 4",
    context: {
      name: "Trine 4: The Nightmare Prince",
      platform: "ps4",
    },
  },
  runMappingProbe: async () => {
    const product = await fetchFromGeedie(
      "Trine 4: The Nightmare Prince",
      "ps4",
    );
    return rawProbe(product);
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Trine 4: The Nightmare Prince",
      platform: "ps4",
    });
    return mappingRawKeysFromFetch(() =>
      fetchFromGeedie(ctx.name, ctx.platform ?? undefined),
    );
  },
};
