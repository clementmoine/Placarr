import {
  explainAttachmentScoreForDisplay,
  type AttachmentDisplayScoreDetails,
  type ScoredAttachmentInput,
} from "@/core/enrich/media/attachmentDisplayScore";
import { fetchMetadataByType } from "@/core/enrich/fetch";
import {
  formatMetadataFromStorage,
  getCachedMetadata,
  storeMetadata,
} from "@/core/enrich/storage";
import {
  isMissingGameMediaGallery,
  isMissingMusicGallery,
  isMissingBookGallery,
} from "@/core/enrich/galleries";
import { isLightRefreshEligible } from "@/core/enrich/lightRefresh";
import { resolveGameMetadataPlatform } from "@/core/enrich/platform";
import { isMediaType } from "@/core/enrich/selection";
import { filterMetadataForShelfPlatform } from "@/core/collect/media";
export { filterMetadataForShelfPlatform };
import {
  assertRefreshCanPersist,
  type ItemMetadataRefreshSession,
} from "@/core/collect/jobs/metadataRefreshSession";
import { isAbortError } from "@/lib/http/abort";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
import {
  scrapeProviderIdsFromStoredSources,
  externalIdsFromStoredSources,
  providerRecordUrlsFromStoredSources,
} from "@/core/enrich/scrapePassGate";
import {
  mergeRomChecksums,
  romChecksumsFromIdentifierFacts,
} from "@/core/enrich/romChecksums";
import type { RomChecksums } from "@/types/providerModule";
import { parseMetadataFactsJson } from "@/core/enrich/metadataFactsMerge";
import { prisma } from "@/lib/db/prisma";
import type { Item, Type } from "@/generated/prisma/browser";
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
} from "@/core/enrich/storage";
export {
  confrontWithDatabase,
  getDatabaseSuggestions,
} from "@/core/enrich/database";
export {
  getMetadataProviderAdapter,
  metadataProviderResolverMap,
} from "@/core/catalog/bootstrap";
export { cleanSearchQuery } from "@/core/enrich/search/query";

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
  return [
    norm(type),
    norm(name),
    norm(barcode),
    norm(platform),
    norm(shelfName),
  ].join("|");
}

async function storedProviderMemoryForItem(itemId: Item["id"]): Promise<{
  scrapeProviderIds: string[];
  externalIds: Record<string, string>;
  providerRecordUrls: Record<string, string>;
  romChecksums?: RomChecksums;
  priceLastUpdated?: Date | null;
}> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      metadata: { include: { attachments: true } },
      fieldEvidence: { select: { source: true, sourceUrl: true } },
      // Newest observation only — light refresh just needs "how old".
      priceOffers: {
        orderBy: { observedAt: "desc" },
        take: 1,
        select: { observedAt: true },
      },
    },
  });
  if (!item) {
    return { scrapeProviderIds: [], externalIds: {}, providerRecordUrls: {} };
  }

  const facts = parseMetadataFactsJson(item.metadata?.facts);

  const metadataEvidence = item.metadata
    ? await prisma.fieldEvidence.findMany({
        where: { metadataId: item.metadata.id },
        select: { source: true, sourceUrl: true },
      })
    : [];

  const fieldEvidence = [...(item.fieldEvidence ?? []), ...metadataEvidence];

  return {
    scrapeProviderIds: scrapeProviderIdsFromStoredSources({
      facts,
      fieldEvidence,
      attachments: item.metadata?.attachments ?? [],
    }),
    externalIds: externalIdsFromStoredSources({
      facts,
      fieldEvidence,
    }),
    providerRecordUrls: providerRecordUrlsFromStoredSources({
      facts,
      fieldEvidence,
    }),
    romChecksums: romChecksumsFromIdentifierFacts(facts),
    priceLastUpdated: item.priceOffers?.[0]?.observedAt ?? null,
  };
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
    queuePriority?: "high" | "normal";
    signal?: AbortSignal;
    existingScrapeProviderIds?: readonly string[];
    existingExternalIds?: Record<string, string | null>;
    existingProviderRecordUrls?: Record<string, string>;
    romChecksums?: RomChecksums;
    seededActiveResults?: MetadataResult[];
    lightRefresh?: boolean;
    onApiPassComplete?: (partial: MetadataResult) => Promise<void>;
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

  // Abortable lookups / progressive-store callbacks must not enter the shared
  // cache: a cancelled refresh would otherwise poison concurrent previews.
  const shareableCache =
    !options.bypassCache &&
    !options.signal &&
    !options.onApiPassComplete &&
    !options.existingScrapeProviderIds?.length &&
    !options.existingExternalIds &&
    !options.existingProviderRecordUrls &&
    !options.romChecksums &&
    !options.seededActiveResults?.length;

  if (shareableCache) {
    const cached = metadataCache.get(key);
    if (cached && cached.expires > now) {
      return cached.promise;
    }
  }

  const promise = (async () => {
    try {
      const result = await fetchMetadataByType(
        name,
        type,
        barcode,
        resolvedPlatform,
        {
          isBackground: options.isBackground,
          shelfName: options.shelfName,
          queuePriority: options.queuePriority,
          signal: options.signal,
          existingScrapeProviderIds: options.existingScrapeProviderIds,
          existingExternalIds: options.existingExternalIds,
          existingProviderRecordUrls: options.existingProviderRecordUrls,
          romChecksums: options.romChecksums,
          seededActiveResults: options.seededActiveResults,
          lightRefresh: options.lightRefresh,
          onApiPassComplete: options.onApiPassComplete,
        },
      );
      return result;
    } catch (err) {
      if (isAbortError(err)) throw err;
      console.error("Failed to fetch metadata:", err);
      return null;
    }
  })();

  if (shareableCache) {
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
  }

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
  if (
    refreshSession &&
    !(await assertRefreshCanPersist(itemId, refreshSession))
  ) {
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
      const staleBookGallery = isMissingBookGallery(
        type,
        barcode,
        cachedMetadata.attachments.map(withProviderAttachmentTraits),
      );
      const staleGameGallery = isMissingGameMediaGallery(
        type,
        barcode,
        cachedMetadata.attachments.map(withProviderAttachmentTraits),
      );
      if (!staleMusicGallery && !staleBookGallery && !staleGameGallery) {
        return formatMetadataFromStorage(cachedMetadata);
      }
    }
  }

  if (
    refreshSession &&
    !(await assertRefreshCanPersist(itemId, refreshSession))
  ) {
    return null;
  }

  const {
    scrapeProviderIds: existingScrapeProviderIds,
    externalIds: existingExternalIds,
    providerRecordUrls: existingProviderRecordUrls,
    romChecksums: storedRomChecksums,
    priceLastUpdated,
  } = await storedProviderMemoryForItem(itemId);

  // Even on forceRefresh, seed capability gating from the current fiche so we
  // gap-fill Tier 0+1 instead of blank-slating IGDB/SS/… every time.
  let seededActiveResults: MetadataResult[] | undefined;
  {
    const prior = await getCachedMetadata(itemId);
    if (prior) {
      seededActiveResults = [formatMetadataFromStorage(prior)];
    }
  }

  // Fiche already canonical, aligned, complete and priced recently: Tier 0+1
  // still runs (it is cheap and pinned), the scrape swarm does not.
  const lightRefresh =
    isMediaType(type) &&
    isLightRefreshEligible({
      type,
      itemName: name,
      stored: seededActiveResults?.[0],
      barcode,
      priceLastUpdated,
    });

  let progressiveStored = false;
  const persistPartial = async (partial: MetadataResult) => {
    if (
      refreshSession &&
      !(await assertRefreshCanPersist(itemId, refreshSession))
    ) {
      return;
    }
    await storeMetadata(itemId, partial, type, name, {
      deferImageLocalization: isBackground,
      // Pass-1 must not enqueue localization — a late Pass-1 job overwrites
      // Pass-2's gallery (drops LaunchBox discs that only survive the final merge).
      skipDeferredLocalizationSchedule: true,
    });
    progressiveStored = true;
  };

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
      existingScrapeProviderIds,
      existingExternalIds,
      existingProviderRecordUrls,
      romChecksums: mergeRomChecksums(
        storedRomChecksums,
        romChecksumsFromIdentifierFacts(seededActiveResults?.[0]?.facts),
      ),
      seededActiveResults,
      lightRefresh,
      onApiPassComplete: persistPartial,
    });
  } catch (error) {
    if (isAbortError(error)) {
      if (!progressiveStored) return null;
      const cached = await getCachedMetadata(itemId);
      return cached ? formatMetadataFromStorage(cached) : null;
    }
    throw error;
  }

  if (!metadata) {
    if (progressiveStored) {
      const cached = await getCachedMetadata(itemId);
      return cached ? formatMetadataFromStorage(cached) : null;
    }
    return null;
  }

  if (
    refreshSession &&
    !(await assertRefreshCanPersist(itemId, refreshSession))
  ) {
    if (!progressiveStored) return null;
    const cached = await getCachedMetadata(itemId);
    return cached ? formatMetadataFromStorage(cached) : null;
  }

  try {
    // Final store (Pass 2 merge, or Pass 1-only when scrapes were skipped).
    const storedMetadata = await storeMetadata(itemId, metadata, type, name, {
      deferImageLocalization: isBackground,
    });
    return formatMetadataFromStorage(storedMetadata);
  } catch (error) {
    console.error("Error storing metadata:", error);
    if (progressiveStored) {
      const cached = await getCachedMetadata(itemId);
      return cached ? formatMetadataFromStorage(cached) : null;
    }
    return null;
  }
}
