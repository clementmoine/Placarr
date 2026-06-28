/**
 * Metadata enrichment runs in the background after an item is created (see the
 * POST /api/items route), so a freshly-added item has no `metadataId` yet. We
 * treat such an item as "still enriching" only for a bounded window after
 * creation — past that, a missing metadata link means enrichment finished
 * without a match, not that it's still running. This bound keeps the shelf poll
 * and the card's fetching indicator from spinning forever.
 */
export const ITEM_ENRICH_WINDOW_MS = 3 * 60 * 1000;

/** Max time we keep showing a manual metadata refresh as in-flight. */
export const METADATA_REFRESH_MAX_MS = 15 * 60 * 1000;

type ItemEnrichmentFields = {
  metadataId?: string | null;
  createdAt?: string | Date | null;
  metadataRefreshStartedAt?: string | Date | null;
};

export function isItemEnriching(
  item: ItemEnrichmentFields | null | undefined,
): boolean {
  if (!item) return false;
  if (item.metadataId) return false;
  if (!item.createdAt) return false;
  const created = new Date(item.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < ITEM_ENRICH_WINDOW_MS;
}

export function isItemMetadataRefreshing(
  item: ItemEnrichmentFields | null | undefined,
): boolean {
  if (!item?.metadataRefreshStartedAt) return false;
  const started = new Date(item.metadataRefreshStartedAt).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started < METADATA_REFRESH_MAX_MS;
}

/** True while metadata is being fetched (initial enrich or manual refresh). */
export function isItemMetadataBusy(
  item: ItemEnrichmentFields | null | undefined,
): boolean {
  return isItemEnriching(item) || isItemMetadataRefreshing(item);
}
