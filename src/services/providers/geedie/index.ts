import { createMetadataHealthCheck } from "@/lib/provider/healthUtils";
import { rawProbe } from "@/lib/dev/mappingProbe";
import type { ProviderModule } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

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
    externalIds: gallery.productId
      ? { geedie: gallery.productId }
      : undefined,
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
    isSecondary: true,
    requiresTitleAlignment: true,
    gameMediaGallerySource: true,
    isRealBoxCover: true,
    coverUrlHost: "geedie.lt",
    remoteImageReferer: "https://geedie.lt/",
    websiteUrl: "https://geedie.lt/",
    notes: "Photos de boîtes du marketplace Geedie (PS/Xbox/Nintendo).",
  },
  expandCoverDownloadCandidates(url) {
    const candidates = [url];
    if (url.includes("imagedelivery.net") && url.includes("/thumbnail")) {
      candidates.push(url.replace("/thumbnail", "/public"));
    }
    if (url.includes("/storage/products/") && url.includes("-cover.webp")) {
      candidates.push(url.replace(/-\d+x\d+-cover\.webp$/, "-cover.webp"));
    }
    return [...new Set(candidates)];
  },
  createMetadataAdapter: () => ({
    id: "geedie",
    async resolve({ name, platform, lookupQueries, barcode }) {
      const queries = lookupQueries?.length ? lookupQueries : [name];
      const gallery = await fetchGeedieGallery(queries, platform, barcode);
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
  runMappingProbe: () =>
    rawProbe("Geedie", () =>
      fetchFromGeedie("Trine 4: The Nightmare Prince", "ps4"),
    ),
};
