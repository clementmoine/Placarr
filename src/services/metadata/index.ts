import {
  explainAttachmentScoreForDisplay,
  type AttachmentDisplayScoreDetails,
  type ScoredAttachmentInput,
} from "@/lib/media/attachmentDisplayScore";
import { fetchMetadataByType } from "@/services/metadata/fetch";
import {
  formatMetadataFromStorage,
  getCachedMetadata,
  storeMetadata,
} from "@/services/metadata/storage";
import { isMissingGameMediaGallery, isMissingMusicGallery } from "@/lib/metadata/galleries";
import { resolveGameMetadataPlatform } from "@/lib/metadata/platform";
import { filterMetadataForShelfPlatform } from "@/lib/item/media";
import {
  assertRefreshCanPersist,
  type ItemMetadataRefreshSession,
} from "@/lib/jobs/metadataRefreshSession";
import { isAbortError } from "@/lib/http/abort";
import { withProviderAttachmentTraits } from "@/services/provider/sourceTraits";
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
} from "@/services/metadata/storage";
export {
  confrontWithDatabase,
  getDatabaseSuggestions,
} from "@/services/metadata/database";
export {
  getMetadataProviderAdapter,
  metadataProviderResolverMap,
} from "@/services/provider/bootstrap";
export { cleanSearchQuery } from "@/lib/search/query";

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
  shelfName?: string | null,
): string {
  const norm = (value?: string | null) =>
    (value ?? "").normalize("NFKC").trim().toLowerCase();
  return [norm(type), norm(name), norm(barcode), norm(platform), norm(shelfName)].join(
    "|",
  );
}

export async function getMetadata(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
  options: {
    bypassCache?: boolean;
    isBackground?: boolean;
    shelfName?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<MetadataResult | null> {
  const resolvedPlatform = resolveGameMetadataPlatform(
    platform,
    options.shelfName,
    type,
  );
  const key = metadataCacheKey(
    name,
    type,
    barcode,
    resolvedPlatform,
    options.shelfName,
  );
  const now = Date.now();

  const applyLookupFilter = (result: MetadataResult | null) =>
    result
      ? filterMetadataForShelfPlatform(result, {
          type,
          name: options.shelfName,
        }) ?? null
      : null;

  if (!options.bypassCache) {
    const cached = metadataCache.get(key);
    if (cached && cached.expires > now) {
      return cached.promise;
    }
  }

  const promise = (async () => {
    try {
      const result = await fetchMetadataByType(name, type, barcode, resolvedPlatform, {
        isBackground: options.isBackground,
        shelfName: options.shelfName,
        signal: options.signal,
      });
      return applyLookupFilter(result);
    } catch (err) {
      if (isAbortError(err)) throw err;
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
  shelfName?: string | null,
  refreshSession?: ItemMetadataRefreshSession,
): Promise<MetadataResult | null> {
  if (refreshSession && !(await assertRefreshCanPersist(itemId, refreshSession))) {
    return null;
  }

  // Check if we should use cached metadata
  if (!forceRefresh) {
    const cachedMetadata = await getCachedMetadata(itemId);
    if (cachedMetadata) {
      const staleMusicGallery = isMissingMusicGallery(
        type,
        barcode,
        cachedMetadata.attachments.map(withProviderAttachmentTraits),
      );
      const staleGameGallery = isMissingGameMediaGallery(
        type,
        barcode,
        cachedMetadata.attachments.map(withProviderAttachmentTraits),
      );
      if (!staleMusicGallery && !staleGameGallery) {
        return formatMetadataFromStorage(cachedMetadata);
      }
    }
  }

  if (refreshSession && !(await assertRefreshCanPersist(itemId, refreshSession))) {
    return null;
  }

  // Fetch new metadata using the name for lookup only
  let metadata: MetadataResult | null;
  const resolvedPlatform = resolveGameMetadataPlatform(
    platform,
    shelfName,
    type,
  );
  try {
    metadata = await getMetadata(name, type, barcode, resolvedPlatform, {
      bypassCache: bypassMetadataCache,
      isBackground,
      shelfName,
      signal: refreshSession?.signal,
    });
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }

  if (!metadata) return null;

  if (refreshSession && !(await assertRefreshCanPersist(itemId, refreshSession))) {
    return null;
  }

  try {
    // Store the metadata without updating the item's name
    const storedMetadata = await storeMetadata(itemId, metadata, type, name);
    return formatMetadataFromStorage(storedMetadata);
  } catch (error) {
    console.error("Error storing metadata:", error);
    return null;
  }
}
