import {
  explainAttachmentScoreForDisplay,
  type AttachmentDisplayScoreDetails,
  type ScoredAttachmentInput,
} from "@/lib/attachmentDisplayScore";
import { fetchMetadataByType } from "@/services/metadataFetch";
import {
  formatMetadataFromStorage,
  getCachedMetadata,
  storeMetadata,
} from "@/services/metadataStorage";
import { isMissingDiscogsGallery } from "@/lib/metadataDiscogs";
import type { Item, Type } from "@prisma/client";
import type { MetadataResult } from "@/types/metadataProvider";

export {
  explainAttachmentScoreForDisplay,
  type AttachmentDisplayScoreDetails,
  type ScoredAttachmentInput,
};

export type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

export {
  formatMetadataForStorage,
  formatMetadataFromStorage,
  downloadRemoteImage,
  readAttachmentImageMetrics,
} from "@/services/metadataStorage";
export {
  confrontWithDatabase,
  getDatabaseSuggestions,
} from "@/services/metadataDatabase";
export { getMetadataProviderAdapter } from "@/services/metadataResolvers";
export { cleanSearchQuery } from "@/services/metadataSearchUtils";
export { pickSSCover } from "@/services/providers/screenscraper";
export type { SSMedia } from "@/services/providers/screenscraper";
export type { BGGChild, BGGResponse } from "@/services/providers/bgg";

/**
 * Short-lived cache of provider lookups keyed by the resolved identity
 * (type + name + barcode + platform). A single scan triggers the same lookup
 * up to three times — QuickScan preview, ItemModal preview, then storage on
 * create — so coalescing them avoids re-hitting slow providers and guarantees
 * the preview and the saved item display the exact same chosen image.
 *
 * The stored value is the in-flight promise, so concurrent identical requests
 * share one network round-trip. Failed/empty lookups are evicted so transient
 * provider timeouts are retried. Explicit user-triggered refreshes bypass it.
 */
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const METADATA_GAME_CACHE_TTL_MS = 30 * 60 * 1000;
const METADATA_CACHE_MAX_ENTRIES = 256;
const metadataCache = new Map<
  string,
  { expires: number; promise: Promise<MetadataResult | null> }
>();

function metadataCacheKey(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): string {
  const norm = (value?: string | null) =>
    (value ?? "").normalize("NFKC").trim().toLowerCase();
  return [norm(type), norm(name), norm(barcode), norm(platform)].join("|");
}

export async function getMetadata(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
  options: { bypassCache?: boolean; isBackground?: boolean } = {},
): Promise<MetadataResult | null> {
  const key = metadataCacheKey(name, type, barcode, platform);
  const now = Date.now();

  if (!options.bypassCache) {
    const cached = metadataCache.get(key);
    if (cached && cached.expires > now) {
      return cached.promise;
    }
  }

  const promise = (async () => {
    try {
      return await fetchMetadataByType(name, type, barcode, platform, options);
    } catch (err) {
      console.error("Failed to fetch metadata:", err);
      return null;
    }
  })();

  metadataCache.set(key, {
    expires:
      now +
      (type === "games" ? METADATA_GAME_CACHE_TTL_MS : METADATA_CACHE_TTL_MS),
    promise,
  });
  if (metadataCache.size > METADATA_CACHE_MAX_ENTRIES) {
    const oldestKey = metadataCache.keys().next().value;
    if (oldestKey !== undefined) metadataCache.delete(oldestKey);
  }

  // Never persist a miss: a null may be a transient provider failure.
  void promise
    .then((result) => {
      if (!result) metadataCache.delete(key);
    })
    .catch(() => metadataCache.delete(key));

  return promise;
}

export async function fetchAndStoreMetadata(
  itemId: Item["id"],
  name: Item["name"],
  type: Type,
  barcode?: string | null,
  forceRefresh = false,
  platform?: string | null,
  // Explicit user-triggered refreshes bypass the short-lived lookup cache so
  // they always re-query providers. Enrichment on create leaves it false to
  // reuse the lookup the scan preview just performed.
  bypassMetadataCache = false,
  isBackground = false,
): Promise<MetadataResult | null> {
  // Check if we should use cached metadata
  if (!forceRefresh) {
    const cachedMetadata = await getCachedMetadata(itemId);
    if (cachedMetadata) {
      const staleDiscogsGallery = isMissingDiscogsGallery(
        type,
        barcode,
        cachedMetadata.attachments,
      );
      if (!staleDiscogsGallery) {
        return formatMetadataFromStorage(cachedMetadata);
      }
    }
  }

  // Fetch new metadata using the name for lookup only
  const metadata = await getMetadata(name, type, barcode, platform, {
    bypassCache: bypassMetadataCache,
    isBackground,
  });
  if (!metadata) return null;

  try {
    // Store the metadata without updating the item's name
    const storedMetadata = await storeMetadata(itemId, metadata, type, name);
    return formatMetadataFromStorage(storedMetadata);
  } catch (error) {
    console.error("Error storing metadata:", error);
    return null;
  }
}
