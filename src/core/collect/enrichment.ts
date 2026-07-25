/**
 * Metadata enrichment runs in the background after an item is created (see the
 * POST /api/items route), so a freshly-added item has no `metadataId` yet. We
 * treat such an item as "still enriching" only for a bounded window after
 * creation — past that, a missing metadata link means enrichment finished
 * without a match, not that it's still running. This bound keeps the shelf poll
 * and the card's fetching indicator from spinning forever.
 */
export const ITEM_ENRICH_WINDOW_MS = 3 * 60 * 1000;

/** Max time UI may treat a refresh stamp as live when no worker job backs it. */
export const METADATA_REFRESH_MAX_MS = 15 * 60 * 1000;

/**
 * When `metadataRefreshStartedAt` is set but no worker owns the item
 * (no pending/running `BackgroundWorkJob`, crashed worker), clear after this grace.
 */
export const METADATA_REFRESH_ORPHAN_GRACE_MS = 2 * 60 * 1000;

/**
 * How long the client may keep an optimistic refresh stamp when a concurrent
 * GET still returns null (API/worker not persisted yet). Must stay short — using
 * a long window would leave “Récupération” stuck after the job actually finished
 * and cleared the DB flag.
 */
export const METADATA_REFRESH_STAMP_PRESERVE_MS = 10_000;

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

/**
 * Manual refresh is in-flight while the persisted stamp is set.
 * The API/worker clear the stamp on completion; orphan reconcile clears zombies
 * with no open job. Do not time-box here — mass refresh queues outlive 15 min.
 */
export function isItemMetadataRefreshing(
  item: ItemEnrichmentFields | null | undefined,
): boolean {
  if (!item?.metadataRefreshStartedAt) return false;
  const started = new Date(item.metadataRefreshStartedAt).getTime();
  return !Number.isNaN(started);
}

/** True while metadata is being fetched (initial enrich or manual refresh). */
export function isItemMetadataBusy(
  item: ItemEnrichmentFields | null | undefined,
): boolean {
  return isItemEnriching(item) || isItemMetadataRefreshing(item);
}

function isWithinMetadataRefreshStampPreserveWindow(
  startedAt: string | Date,
): boolean {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started < METADATA_REFRESH_STAMP_PRESERVE_MS;
}

/**
 * Keep an in-flight refresh stamp when a concurrent GET returns before the
 * worker/API has persisted it (optimistic patch would otherwise be wiped and
 * the UI would toast “metadata updated” immediately).
 *
 * Only for a short race window — once the DB clears the stamp after a finished
 * job, later GETs must accept null so the badge/toast can settle.
 */
export function preserveActiveMetadataRefreshStamp<
  T extends ItemEnrichmentFields,
>(incoming: T, previous: T | null | undefined): T {
  if (!previous?.metadataRefreshStartedAt) return incoming;
  if (incoming.metadataRefreshStartedAt) return incoming;
  if (
    !isWithinMetadataRefreshStampPreserveWindow(
      previous.metadataRefreshStartedAt,
    )
  ) {
    return incoming;
  }
  return {
    ...incoming,
    metadataRefreshStartedAt: previous.metadataRefreshStartedAt,
  };
}

/** Shared React Query poll cadence while metadata work is in-flight.
 *  Kept relatively sparse: full shelf/collection refetches while Flare/sharp
 *  run on the same event loop amplify Network Errors. */
export const METADATA_POLL_INTERVAL_MS = 5000;

export function collectionHasMetadataBusy(
  items: ItemEnrichmentFields[] | null | undefined,
): boolean {
  return items?.some((item) => isItemMetadataBusy(item)) ?? false;
}

export function metadataBusyRefetchInterval(
  items: ItemEnrichmentFields[] | null | undefined,
): number | false {
  return collectionHasMetadataBusy(items) ? METADATA_POLL_INTERVAL_MS : false;
}
