/**
 * itemMedia.ts — Affichage média produit (cover, hero, galerie)
 *
 * Règle unique pour toute l'app :
 * - cover canonique = metadata.imageUrl (calculée à l'enregistrement)
 * - fallback legacy = scoring objectif sur les attachments (pas de priorité provider)
 * - photo utilisateur locale = override explicite
 */

import type { AttachmentType } from "@prisma/client";
import type { Locale } from "@/types/i18n";
import { getBestLocale } from "@/core/locale/utils";

import {
  coverListHasShelfCompatibleBoxCover,
  coverListHasShelfPlatformSignal,
  isAttachmentCoverPlatformMismatch,
  isCoverAmbiguousForShelfPlatform,
  isDiscCoverAttachment,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  rankCoverGalleryAttachments,
  scoreAttachmentForDisplay,
  shouldShowCoverAttachmentOnShelf,
  isMarketplaceCoverRole,
  coverLocaleRankForAttachment,
  type AttachmentDisplayScoreOptions,
  type AttachmentImageMetrics,
  type ScoredAttachmentInput,
} from "@/core/enrich/media/attachmentDisplayScore";
import { resolveAttachmentSemantics } from "@/core/enrich/media/attachmentDisplayLabels";
import type { MetadataAttachment } from "@/types/metadataProvider";
import { stampAttachmentsMissingPlatformKey } from "@/core/enrich/media/platformKeyStamp";
import { isVideoGamePlatformKey } from "@/core/identify/platforms/platforms";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import { discoveredBarcodeMatchesRequestedPlatform } from "@/core/enrich/discoveredBarcode";
import {
  attachmentTitleMediaTypeConflicts,
  catalogAttachmentTitleConflicts,
} from "@/core/enrich/titleMatching";
import { priceListingSharesItemIdentity } from "@/core/commerce/retailer/titleMatch";
import {
  filterPlaceholderCoverAttachments,
  isMissingArtImageUrl,
  isPlaceholderCoverFromPersistedMetrics,
  type PlaceholderCoverSignals,
} from "@/core/enrich/media/coverPlaceholder";
import { isCoverResolutionAcceptable } from "@/core/enrich/media/coverResolution";
import {
  findAttachmentForUrl,
  isCoverEligibleAttachmentType,
  isUrlEligibleDefaultCover,
  stripCropSuffixFromUrl,
  urlsReferToSameLocalizedImage,
} from "@/core/enrich/media/coverUrl";
import {
  coverRegionFromAgeRatingBoard,
  roleWithoutCollectorRegion,
} from "@/core/enrich/media/collectorCoverRegion";

export interface MediaItem {
  url: string;
  type: AttachmentType | string;
  source?: string | null;
  role?: string | null;
  title?: string | null;
  // Provider-derived display fields stamped server-side (see providerSourceTraits):
  // cover-scoring flags read by the scorer, plus the gallery chip label.
  isFullWrapCoverSource?: boolean;
  isGameMediaGallerySource?: boolean;
  isMusicGallerySource?: boolean;
  isCanonicalCoverSource?: boolean;
  retailCatalogImageTitlesSource?: boolean;
  catalogCoverTitlesSource?: boolean;
  strictShelfPlatformCoverSource?: boolean;
  collectorCoverRegionFromAgeRatingSource?: boolean;
  coverProvenance?: string | null;
  // Persisted at enrichment from the original image URL; the platform-aware cover
  // ranking's load-bearing signal once the URL is a local /uploads path.
  platformKey?: string | null;
  providerLabel?: string | null;
  /** Contributor source ids when several providers share this URL. */
  sourceNames?: string[] | null;
  /** SteamGridDB-style cover sources — enables style/variant chip labels. */
  gridStyleCoverLabelsSource?: boolean;
  // Persisted image metrics (computed once at enrichment) so the read-time cover
  // ranking can sort by resolution + exposure without re-decoding image files.
  width?: number | null;
  height?: number | null;
  meanLuminance?: number | null;
  darkPixelRatio?: number | null;
}

export interface MediaInput {
  imageUrl?: string | null;
  updatedAt?: Date | string | null;
  /** Item grade — loose games prefer disc art as the displayed cover. */
  condition?: string | null;
  metadata?: {
    imageUrl?: string | null;
    heroImageUrl?: string | null;
    sourceType?: string | null;
    lastFetched?: Date | string | null;
    attachments?: MediaItem[] | null;
  } | null;
  shelf?: {
    type?: string | null;
    name?: string | null;
  } | null;
}

function isUserUploadedImage(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith("/") || url.startsWith("data:");
}

/** Cover saved manually after the last enrichment — do not auto-heal over it. */
export function isExplicitUserCoverOverride(item: MediaInput): boolean {
  if (!item.imageUrl) return false;
  const lastFetched = item.metadata?.lastFetched;
  const updatedAt = item.updatedAt;
  if (!lastFetched || !updatedAt) return false;
  if (new Date(updatedAt).getTime() <= new Date(lastFetched).getTime()) {
    return false;
  }
  // Enrichment often syncs item.imageUrl to metadata.imageUrl right after
  // writing lastFetched, which bumps updatedAt — that is not a gallery pick.
  const metadataCover = item.metadata?.imageUrl?.trim();
  if (
    metadataCover &&
    urlsReferToSameLocalizedImage(item.imageUrl, metadataCover)
  ) {
    return false;
  }
  return true;
}

/**
 * Durable user cover: either a persisted `source: "user"` gallery attachment, or
 * a post-enrichment override. Survives metadata refresh (unlike timestamp-only).
 */
export function isHonoredUserCoverPin(item: MediaInput): boolean {
  const pin = item.imageUrl?.trim();
  if (!pin) return false;
  const list = attachments(item);
  // Prefer an explicit user pin even when a provider row shares the same crop.
  if (
    list.some(
      (attachment) =>
        attachment.source === "user" &&
        attachment.url &&
        urlsReferToSameLocalizedImage(attachment.url, pin),
    )
  ) {
    return true;
  }
  return isExplicitUserCoverOverride(item);
}

/** User uploads always lead the cover picker / gallery, ahead of catalog art. */
function pinUserCoversFirst(
  ranked: ScoredAttachmentInput[],
): ScoredAttachmentInput[] {
  const catalogKeys = new Set(
    ranked
      .filter((attachment) => normalizeSourceKey(attachment.source) !== "user")
      .map((attachment) =>
        attachment.url ? stripCropSuffixFromUrl(attachment.url) : "",
      )
      .filter(Boolean),
  );
  const users: ScoredAttachmentInput[] = [];
  const rest: ScoredAttachmentInput[] = [];
  for (const attachment of ranked) {
    if (attachment.source === "user") {
      const key = attachment.url
        ? stripCropSuffixFromUrl(attachment.url)
        : "";
      // Honor pin sharing the catalog file must not appear as a leading "Perso"
      // card — URL dedupe already prefers the provider row.
      if (key && catalogKeys.has(key)) {
        continue;
      }
      users.push(attachment);
    } else {
      rest.push(attachment);
    }
  }
  return users.length === 0 ? ranked : [...users, ...rest];
}

function resolveCoverUiLocale(uiLocale?: Locale | null): Locale | undefined {
  if (uiLocale) return uiLocale;
  if (typeof window !== "undefined") return getBestLocale();
  return undefined;
}

function coverDisplayOptions(
  item: MediaInput,
  uiLocale?: Locale | null,
): AttachmentDisplayScoreOptions {
  const resolvedLocale = resolveCoverUiLocale(uiLocale);
  const preferDiscCover =
    item.condition === "loose" && item.shelf?.type === "games";
  return {
    requestedPlatformKey:
      item.shelf?.type === "games"
        ? detectShelfGamePlatformKey(item.shelf?.name)
        : undefined,
    ...(resolvedLocale ? { uiLocale: resolvedLocale } : {}),
    ...(preferDiscCover ? { preferDiscCover: true } : {}),
  };
}

/** Attachments carry their persisted image metrics (see `MediaItem`). */
type DisplayAttachment = ScoredAttachmentInput & PlaceholderCoverSignals;

function attachments(item: MediaInput): DisplayAttachment[] {
  const list = filterPlaceholderCoverAttachments(
    (item.metadata?.attachments ?? []) as DisplayAttachment[],
  );
  const shelfPlatformKey =
    item.shelf?.type === "games"
      ? detectShelfGamePlatformKey(item.shelf.name)
      : undefined;
  if (!shelfPlatformKey) return list;

  return list.map((attachment) => {
    if (attachment.platformKey || !attachment.isGameMediaGallerySource) {
      return attachment;
    }
    const [stamped] = stampAttachmentsMissingPlatformKey(
      [attachment as MetadataAttachment],
      shelfPlatformKey,
    );
    return (stamped ?? attachment) as DisplayAttachment;
  });
}

/**
 * Build the read-time image-metrics map from the metrics persisted on each
 * attachment at enrichment (resolution + exposure). This is what lets the cover
 * gallery re-sort from stored data — without re-decoding any image file — so a
 * ranking change no longer needs a metadata refresh to take effect.
 */
function persistedImageMetricsByUrl(
  item: MediaInput,
): Map<string, AttachmentImageMetrics | null> | undefined {
  const list = item.metadata?.attachments;
  if (!list || list.length === 0) return undefined;
  const map = new Map<string, AttachmentImageMetrics | null>();
  for (const attachment of list) {
    if (!attachment.url) continue;
    const { width, height, meanLuminance, darkPixelRatio } = attachment;
    if (
      width == null &&
      height == null &&
      meanLuminance == null &&
      darkPixelRatio == null
    ) {
      continue;
    }
    map.set(attachment.url, {
      width: width ?? undefined,
      height: height ?? undefined,
      meanLuminance: meanLuminance ?? undefined,
      darkPixelRatio: darkPixelRatio ?? undefined,
    });
  }
  return map.size > 0 ? map : undefined;
}

const COVER_GALLERY_TYPES = new Set(["cover", "artwork", "image"]);

// Set<string>: attachment.type is AttachmentType | string (see MediaItem).
const BACKGROUND_PICKER_TYPES = new Set<string>([
  "background",
  "artwork",
  "screenshot",
  "image",
]);

/**
 * Background choices for the item editor: dedicated hero/screenshot assets first,
 * then ranked covers when nothing else exists (typical boardgames — retailers only
 * publish box art, not landscape backdrops).
 */
export function backgroundPickerAttachments(
  metadata:
    | {
        attachments?: MediaItem[] | null;
      }
    | null
    | undefined,
  options?: AttachmentDisplayScoreOptions,
  imageMetricsByUrl?: Map<string, AttachmentImageMetrics | null>,
): ScoredAttachmentInput[] {
  const attachmentsList = metadata?.attachments ?? [];
  const dedicated = attachmentsList.filter(
    (attachment) =>
      attachment.url && BACKGROUND_PICKER_TYPES.has(attachment.type),
  );
  const dedupedDedicated = dedupeAttachmentsByImageUrl(
    dedicated as ScoredAttachmentInput[],
  );
  if (dedupedDedicated.length > 0) {
    return rankAttachmentsForDisplay(
      dedupedDedicated,
      imageMetricsByUrl,
      options,
    );
  }

  const covers = attachmentsList.filter(
    (attachment) => attachment.url && COVER_GALLERY_TYPES.has(attachment.type),
  );
  const shelfCovers = options?.requestedPlatformKey
    ? filterCoverAttachmentsForShelfPlatform(
        covers as ScoredAttachmentInput[],
        options,
      )
    : (covers as ScoredAttachmentInput[]);

  return rankCoverGalleryAttachments(shelfCovers, imageMetricsByUrl, options);
}

export function backgroundPickerAttachmentsForItem(
  metadata:
    | {
        attachments?: MediaItem[] | null;
      }
    | null
    | undefined,
  shelf?: MediaInput["shelf"],
  uiLocale?: Locale | null,
): ScoredAttachmentInput[] {
  return backgroundPickerAttachments(
    metadata,
    coverDisplayOptions({ shelf }, uiLocale),
  );
}

/** Drop covers whose title/role names another console than the shelf. */
export function filterCoverAttachmentsForShelfPlatform(
  list: ScoredAttachmentInput[],
  options: AttachmentDisplayScoreOptions,
): ScoredAttachmentInput[] {
  return coverAttachmentsMatchingShelfPlatform(list, options);
}

/** Strip wrong-platform covers from a metadata payload before API / modal use. */
function filterAttachmentsForProductTitle<
  T extends {
    title?: string | null;
    attachments?: MediaItem[] | null;
  },
>(metadata: T, shelf?: MediaInput["shelf"]): T {
  const withoutPlaceholders = filterPlaceholderCoverAttachments(
    metadata.attachments ?? [],
  );

  const productTitle = metadata.title?.trim();
  if (!productTitle) {
    return { ...metadata, attachments: withoutPlaceholders };
  }

  const attachments = withoutPlaceholders.filter((attachment) => {
    if (!COVER_GALLERY_TYPES.has(attachment.type)) return true;
    const attachmentTitle = attachment.title?.trim();
    if (!attachmentTitle) return true;
    if (
      attachmentTitleMediaTypeConflicts(productTitle, attachmentTitle, {
        mediaType: shelf?.type,
      })
    ) {
      return false;
    }
    if (
      attachment.retailCatalogImageTitlesSource &&
      !priceListingSharesItemIdentity(productTitle, attachmentTitle)
    ) {
      return false;
    }
    if (
      attachment.retailCatalogImageTitlesSource ||
      attachment.catalogCoverTitlesSource
    ) {
      return !catalogAttachmentTitleConflicts(productTitle, attachmentTitle, {
        mediaType: shelf?.type,
      });
    }
    return true;
  });

  return { ...metadata, attachments };
}

/**
 * metadata.imageUrl can outlive its gallery row (legacy rows, partial writes).
 * Keep the pin only when it never had a backing attachment — never resurrect a
 * cover that was deliberately dropped for wrong-platform shelf mismatch.
 */
function orphanMetadataImageUrlFallback(
  pin: string | null | undefined,
  originalAttachments: readonly { url?: string | null }[],
): string | null {
  const trimmedPin = pin?.trim();
  if (!trimmedPin || isMissingArtImageUrl(trimmedPin)) return null;
  const hasBacking = originalAttachments.some(
    (attachment) =>
      attachment.url &&
      urlsReferToSameLocalizedImage(attachment.url, trimmedPin),
  );
  return hasBacking ? null : trimmedPin;
}

function reconcileImageUrlAfterAttachmentFilter<
  T extends {
    imageUrl?: string | null;
    attachments?: MediaItem[] | null;
  },
>(
  metadata: T,
  attachments: MediaItem[],
  options: AttachmentDisplayScoreOptions,
  originalAttachments: readonly { url?: string | null }[] = attachments,
): T {
  const pinned = metadata.imageUrl?.trim();
  const pinnedAttachment = pinned
    ? attachments.find(
        (attachment) =>
          attachment.url &&
          urlsReferToSameLocalizedImage(attachment.url, pinned),
      )
    : undefined;
  const stillValid = Boolean(pinned && pinnedAttachment);

  // A platform-ambiguous pin yields the default slot to a shelf-platform-matched
  // cover when one exists (the ambiguous cover stays in `attachments`, just no
  // longer the default). Known-mismatch pins were already filtered out upstream.
  const requestedPlatformKey = options.requestedPlatformKey;
  const pinnedSupersededByPlatformMatch =
    !!pinnedAttachment &&
    isVideoGamePlatformKey(requestedPlatformKey) &&
    isCoverAmbiguousForShelfPlatform(
      pinnedAttachment as ScoredAttachmentInput,
      requestedPlatformKey,
    ) &&
    coverListHasShelfPlatformSignal(
      attachments as ScoredAttachmentInput[],
      requestedPlatformKey,
    );

  const rawImageUrl =
    stillValid &&
    !pinnedSupersededByPlatformMatch &&
    isUrlEligibleDefaultCover(pinned, attachments)
      ? pinned
      : (pickBestCoverFromAttachments(
          attachments as ScoredAttachmentInput[],
          undefined,
          options,
        ) ?? orphanMetadataImageUrlFallback(pinned, originalAttachments));
  const imageUrl =
    rawImageUrl && isMissingArtImageUrl(rawImageUrl) ? null : rawImageUrl;

  return {
    ...metadata,
    attachments,
    imageUrl: imageUrl ?? undefined,
  };
}

function sanitizeDiscoveredBarcodeForShelf<
  T extends { barcode?: string | null; platformKey?: string | null },
>(metadata: T, options: AttachmentDisplayScoreOptions): T {
  if (!metadata.barcode || !options.requestedPlatformKey) return metadata;
  if (
    discoveredBarcodeMatchesRequestedPlatform(
      metadata,
      options.requestedPlatformKey,
    )
  ) {
    return metadata;
  }
  return { ...metadata, barcode: undefined };
}

export function filterMetadataForShelfPlatform<
  T extends {
    title?: string | null;
    imageUrl?: string | null;
    barcode?: string | null;
    platformKey?: string | null;
    attachments?: MediaItem[] | null;
  },
>(metadata: T | null | undefined, shelf?: MediaInput["shelf"]): T | undefined {
  if (!metadata) return undefined;

  const metadataForTitle = filterAttachmentsForProductTitle(metadata, shelf);
  const collectorAgeRating =
    (
      metadataForTitle as {
        facts?: Array<{ kind?: string; source?: string; value?: string }>;
      }
    ).facts?.find((fact) => {
      if (fact.kind !== "age-rating" || !fact.source) return false;
      return (metadataForTitle.attachments ?? []).some(
        (attachment) =>
          attachment.collectorCoverRegionFromAgeRatingSource &&
          attachment.source === fact.source,
      );
    })?.value ?? null;
  const collectorRegionFromRating =
    coverRegionFromAgeRatingBoard(collectorAgeRating);
  const attachmentsWithSanitizedCollectorRoles = (
    metadataForTitle.attachments ?? []
  ).map((attachment) => {
    if (
      !attachment.collectorCoverRegionFromAgeRatingSource ||
      !attachment.role
    ) {
      return attachment;
    }
    if (collectorRegionFromRating) return attachment;
    const stripped = roleWithoutCollectorRegion(attachment.role);
    return stripped
      ? { ...attachment, role: stripped }
      : { ...attachment, role: undefined };
  });

  const options = coverDisplayOptions({ shelf });
  if (!options.requestedPlatformKey) {
    return sanitizeDiscoveredBarcodeForShelf(
      reconcileImageUrlAfterAttachmentFilter(
        {
          ...metadataForTitle,
          attachments: attachmentsWithSanitizedCollectorRoles,
        },
        attachmentsWithSanitizedCollectorRoles,
        options,
      ),
      options,
    );
  }

  const filteredAttachments = coverAttachmentsMatchingShelfPlatform(
    attachmentsWithSanitizedCollectorRoles as ScoredAttachmentInput[],
    options,
  );

  return sanitizeDiscoveredBarcodeForShelf(
    reconcileImageUrlAfterAttachmentFilter(
      {
        ...metadataForTitle,
        attachments: attachmentsWithSanitizedCollectorRoles,
      },
      filteredAttachments,
      options,
      attachmentsWithSanitizedCollectorRoles,
    ),
    options,
  );
}

function shelfCoverCandidates(
  list: ScoredAttachmentInput[],
): ScoredAttachmentInput[] {
  return list.filter((attachment) => COVER_GALLERY_TYPES.has(attachment.type));
}

function coverAttachmentsMatchingShelfPlatform(
  list: ScoredAttachmentInput[],
  options: AttachmentDisplayScoreOptions,
): ScoredAttachmentInput[] {
  const platformKey = options.requestedPlatformKey;
  if (!platformKey) return list;

  const coverCandidates = shelfCoverCandidates(list);

  return list.filter((attachment) => {
    if (!COVER_GALLERY_TYPES.has(attachment.type)) return true;
    return shouldShowCoverAttachmentOnShelf(
      attachment,
      platformKey,
      coverCandidates,
    );
  });
}

function isGridStylePinnedCover(attachment: ScoredAttachmentInput): boolean {
  const { kind } = resolveAttachmentSemantics({
    type: attachment.type,
    role: attachment.role,
    title: attachment.title,
    source: attachment.source,
  });
  return kind === "grid" || kind === "grid3d" || kind === "artwork";
}

function pinnedCoverNeedsPlatformFallback(
  item: MediaInput,
  pin: string,
  options: AttachmentDisplayScoreOptions,
  { honorUserOverride = false }: { honorUserOverride?: boolean } = {},
): boolean {
  const list = attachments(item);
  if (
    list.some(
      (attachment) =>
        attachment.source === "user" &&
        attachment.url &&
        urlsReferToSameLocalizedImage(attachment.url, pin),
    )
  ) {
    return false;
  }
  const attachment = attachmentForUrl(item, pin);
  if (!attachment) {
    if (isUserUploadedImage(pin)) return false;
    if (
      item.metadata?.imageUrl &&
      item.metadata.imageUrl !== pin &&
      pin.startsWith("/uploads/")
    ) {
      return true;
    }
    return false;
  }
  if (!honorUserOverride) {
    if (isPlaceholderCoverFromPersistedMetrics(attachment)) return true;
  }
  if (attachment.type && !isCoverEligibleAttachmentType(attachment.type)) {
    return true;
  }
  const metrics =
    persistedImageMetricsByUrl(item)?.get(pin) ??
    (attachment.width != null && attachment.height != null
      ? { width: attachment.width, height: attachment.height }
      : null);
  if (!honorUserOverride && !isCoverResolutionAcceptable(metrics)) return true;
  if (
    isAttachmentCoverPlatformMismatch(attachment, options.requestedPlatformKey)
  ) {
    return true;
  }
  // Explicit gallery/upload picks must stick — do not auto-heal to a box cover
  // when the collector chose a SteamGridDB grid (or an ambiguous regional pin).
  if (honorUserOverride) return false;
  const requestedPlatformKey = options.requestedPlatformKey;
  if (
    isVideoGamePlatformKey(requestedPlatformKey) &&
    isGridStylePinnedCover(attachment) &&
    coverListHasShelfCompatibleBoxCover(
      shelfCoverCandidates(list),
      requestedPlatformKey,
    )
  ) {
    return true;
  }
  // Promote a shelf-platform-matched cover to the default even when the current pin
  // is only platform-*ambiguous* (unidentified). The ambiguous cover stays in the
  // gallery — it just stops being the default. Known-mismatch pins were dropped above.
  return (
    isVideoGamePlatformKey(requestedPlatformKey) &&
    isCoverAmbiguousForShelfPlatform(attachment, requestedPlatformKey) &&
    coverListHasShelfPlatformSignal(
      shelfCoverCandidates(list),
      requestedPlatformKey,
    )
  );
}

function dedupeAttachmentsByImageUrl(
  list: ScoredAttachmentInput[],
): ScoredAttachmentInput[] {
  const byKey = new Map<string, ScoredAttachmentInput>();

  for (const attachment of list) {
    if (!attachment.url) continue;
    const key = stripCropSuffixFromUrl(attachment.url);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, attachment);
      continue;
    }
    // Synthetic honor pins (`source: user`) share the provider file URL after a
    // gallery pick — keep the catalog row for badges (Booknode, not "Perso").
    if (
      normalizeSourceKey(existing.source) === "user" &&
      normalizeSourceKey(attachment.source) !== "user"
    ) {
      byKey.set(key, {
        ...attachment,
        // Preserve any picker-only fields already on the user row.
        sourceNames: attachment.sourceNames ?? existing.sourceNames,
        providerLabel: attachment.providerLabel ?? existing.providerLabel,
      });
    }
  }

  return Array.from(byKey.values());
}

function normalizeSourceKey(source?: string | null): string {
  return (source || "").split(/[·/]/)[0].toLowerCase().trim();
}

function orderRankedCoversWithMetadataPin(
  ranked: ScoredAttachmentInput[],
  pin: string | null,
): ScoredAttachmentInput[] {
  if (!pin) return dedupeAttachmentsByImageUrl(ranked);

  const pinned = ranked.filter(
    (attachment) =>
      attachment.url && urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  const pinAttachment = pinned[0];
  const hasRegionalCatalog = ranked.some(
    (attachment) =>
      attachment.url &&
      attachment !== pinAttachment &&
      !isMarketplaceCoverRole(attachment.role) &&
      COVER_GALLERY_TYPES.has(attachment.type),
  );

  if (
    pinAttachment &&
    isMarketplaceCoverRole(pinAttachment.role) &&
    hasRegionalCatalog
  ) {
    return dedupeAttachmentsByImageUrl(ranked);
  }

  const rest = ranked.filter(
    (attachment) =>
      !attachment.url || !urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  return dedupeAttachmentsByImageUrl([...pinned, ...rest]);
}

function attachmentForUrl(
  item: MediaInput,
  url: string,
): DisplayAttachment | undefined {
  return attachments(item).find(
    (attachment) =>
      attachment.url && urlsReferToSameLocalizedImage(attachment.url, url),
  );
}

/**
 * `source: "user"` pins only apply when they match `item.imageUrl`. Orphan user
 * rows (left behind after a failed / partial save) must not win automatic
 * ranking — especially when a marketplace metadata pin is demoted.
 */
function catalogCoverAttachments(
  item: MediaInput,
  list: DisplayAttachment[],
): DisplayAttachment[] {
  const pin = item.imageUrl?.trim();
  return list.filter((attachment) => {
    if (attachment.source !== "user") return true;
    return (
      !!pin &&
      !!attachment.url &&
      urlsReferToSameLocalizedImage(attachment.url, pin)
    );
  });
}

/** metadata.imageUrl unless it explicitly targets another console than the shelf. */
export function resolveMetadataCoverUrl(
  item: MediaInput,
  uiLocale?: Locale | null,
): string | null {
  const pin = item.metadata?.imageUrl;
  if (!pin || isMissingArtImageUrl(pin)) return null;

  const options = coverDisplayOptions(item, uiLocale);
  const list = catalogCoverAttachments(item, attachments(item));
  const pinAttachment = findAttachmentForUrl(list, pin);
  const coverPool = coverAttachmentsMatchingShelfPlatform(
    list.filter((attachment) => COVER_GALLERY_TYPES.has(attachment.type)),
    options,
  );
  const itemPin = item.imageUrl?.trim();
  const itemPinStale =
    !!itemPin &&
    !findAttachmentForUrl(list, itemPin) &&
    itemPin.startsWith("/uploads/") &&
    coverPool.length > 0;

  if (
    !isUrlEligibleDefaultCover(pin, list) ||
    pinnedCoverNeedsPlatformFallback(item, pin, options) ||
    (!pinAttachment && coverPool.length > 0 && itemPinStale)
  ) {
    return (
      pickBestCoverFromAttachments(
        coverPool,
        persistedImageMetricsByUrl(item),
        options,
      ) ?? null
    );
  }

  if (
    pinAttachment &&
    isMarketplaceCoverRole(pinAttachment.role) &&
    coverPool.length > 0
  ) {
    const bestRegional = pickBestCoverFromAttachments(
      coverPool.filter(
        (attachment) => !isMarketplaceCoverRole(attachment.role),
      ),
      persistedImageMetricsByUrl(item),
      options,
    );
    if (bestRegional) return bestRegional;
  }

  // Enrichment may stamp metadata.imageUrl to a high-scoring NTSC box (Geedie US)
  // while the gallery already has a better locale match (HDJV FR). Prefer the
  // locale-ranked catalog cover over that stale regional pin.
  if (pinAttachment && coverPool.length > 0) {
    const metrics = persistedImageMetricsByUrl(item);
    const bestUrl = pickBestCoverFromAttachments(coverPool, metrics, options);
    if (bestUrl && !urlsReferToSameLocalizedImage(bestUrl, pin)) {
      const bestAttachment = findAttachmentForUrl(coverPool, bestUrl);
      if (
        bestAttachment &&
        coverLocaleRankForAttachment(bestAttachment, options) <
          coverLocaleRankForAttachment(pinAttachment, options)
      ) {
        return bestUrl;
      }
    }
  }

  return pin;
}

/**
 * Cover gallery order: quality-ranked at read time, with the effective metadata
 * default pinned first when it matches the shelf platform.
 */
export function orderedCoverAttachmentsForDisplay(
  item: MediaInput,
  uiLocale?: Locale | null,
): ScoredAttachmentInput[] {
  const options = coverDisplayOptions(item, uiLocale);
  const covers = coverAttachmentsMatchingShelfPlatform(
    attachments(item).filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
    options,
  );
  if (covers.length === 0) return [];
  const ranked = rankCoverGalleryAttachments(
    covers,
    persistedImageMetricsByUrl(item),
    options,
  );
  // Loose copies: keep the disc-first ranking — don't re-pin the catalog box.
  if (options.preferDiscCover) {
    return pinUserCoversFirst(ranked);
  }
  const pin = resolveMetadataCoverUrl(item, uiLocale);

  return pinUserCoversFirst(
    orderRankedCoversWithMetadataPin(ranked, pin),
  );
}

/** Merge enrichment order with transient picker entries (scan / local crop). */
export function mergeCoverAttachmentsForPicker(
  item: MediaInput,
  pickerAttachments: ScoredAttachmentInput[],
  uiLocale?: Locale | null,
): ScoredAttachmentInput[] {
  const options = coverDisplayOptions(item, uiLocale);
  const itemCovers = coverAttachmentsMatchingShelfPlatform(
    attachments(item).filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
    options,
  );
  const pickerCovers = coverAttachmentsMatchingShelfPlatform(
    pickerAttachments.filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
    options,
  );
  const ranked = rankCoverGalleryAttachments(
    dedupeAttachmentsByImageUrl([...itemCovers, ...pickerCovers]),
    persistedImageMetricsByUrl(item),
    options,
  );
  const ordered = pinUserCoversFirst(
    options.preferDiscCover
      ? ranked
      : orderRankedCoversWithMetadataPin(
          ranked,
          resolveMetadataCoverUrl(item, uiLocale),
        ),
  );
  const nonCovers = pickerAttachments.filter(
    (attachment) => !COVER_GALLERY_TYPES.has(attachment.type),
  );
  return [...ordered, ...nonCovers];
}

function rankedAttachments(
  item: MediaInput,
  uiLocale?: Locale | null,
): ScoredAttachmentInput[] {
  return rankAttachmentsForDisplay(
    attachments(item),
    undefined,
    coverDisplayOptions(item, uiLocale),
  );
}

/**
 * Retourne l'URL de la jaquette affichée partout dans l'app.
 * item.imageUrl = choix explicite utilisateur (upload ou galerie) uniquement
 * lorsque `isHonoredUserCoverPin` — sinon le classement dynamique /
 * metadata.imageUrl gagne (évite un pin d'enrichissement obsolète).
 * Loose games prefer disc/support art when available (unless the user overrode).
 */
export function getCoverImage(
  item: MediaInput,
  uiLocale?: Locale | null,
): string | null {
  const options = coverDisplayOptions(item, uiLocale);
  const honorUserOverride = isHonoredUserCoverPin(item);
  const list = attachments(item);
  const catalogList = catalogCoverAttachments(item, list);
  const coverList = catalogList.filter((attachment) =>
    COVER_GALLERY_TYPES.has(attachment.type),
  );
  const coverPool = coverAttachmentsMatchingShelfPlatform(coverList, options);
  const metrics = persistedImageMetricsByUrl(item);

  if (options.preferDiscCover && !honorUserOverride) {
    const hasDisc = coverPool.some((attachment) =>
      isDiscCoverAttachment(attachment),
    );
    if (hasDisc) {
      const discCover = pickBestCoverFromAttachments(
        coverPool,
        metrics,
        options,
      );
      if (discCover) return discCover;
    }
  }

  const pin = item.imageUrl?.trim();
  const pinBacked = pin ? Boolean(findAttachmentForUrl(list, pin)) : false;
  const metadataPin = item.metadata?.imageUrl?.trim();
  const metadataPinBackedInPool =
    !!metadataPin &&
    coverList.some(
      (attachment) =>
        attachment.url &&
        urlsReferToSameLocalizedImage(attachment.url, metadataPin),
    );
  const pinIsStaleEnrichmentOrphan =
    !!pin &&
    !pinBacked &&
    pin.startsWith("/uploads/") &&
    coverList.length > 0 &&
    (!metadataPin ||
      !urlsReferToSameLocalizedImage(pin, metadataPin) ||
      !metadataPinBackedInPool);

  // Only a real user gallery/upload choice may override the dynamic default.
  // Enrichment-synced item.imageUrl must not stick once ranking / metadata moves on.
  if (
    pin &&
    honorUserOverride &&
    isUrlEligibleDefaultCover(pin, list) &&
    !pinnedCoverNeedsPlatformFallback(item, pin, options, {
      honorUserOverride,
    }) &&
    (!pinIsStaleEnrichmentOrphan || honorUserOverride)
  ) {
    return pin;
  }

  const metadataCover = resolveMetadataCoverUrl(item, uiLocale);
  if (metadataCover) {
    return metadataCover;
  }

  const bestFromAttachments = pickBestCoverFromAttachments(
    coverPool,
    metrics,
    options,
  );
  if (bestFromAttachments) return bestFromAttachments;

  // Scan / pre-metadata cover: keep whatever is stored until a ranked default exists.
  if (pin && isUrlEligibleDefaultCover(pin, list)) {
    return pin;
  }

  return null;
}

export function getHeroImage(
  item: MediaInput,
  uiLocale?: Locale | null,
): string | null {
  // Quality-ranked hero computed at enrichment time (sharp, landscape). Takes
  // precedence over the legacy type-order heuristic, which has no resolution
  // signal at display time.
  if (item.metadata?.heroImageUrl) return item.metadata.heroImageUrl;

  const ranked = rankedAttachments(item, uiLocale);
  const bg = ranked.find((attachment) => attachment.type === "background");
  if (bg) return bg.url;

  const artwork = ranked.find((attachment) => attachment.type === "artwork");
  if (artwork) return artwork.url;

  const screenshot = ranked.find(
    (attachment) => attachment.type === "screenshot",
  );
  if (screenshot) return screenshot.url;

  return getCoverImage(item, uiLocale);
}

export function getGalleryImages(
  item: MediaInput,
  max?: number,
  uiLocale?: Locale | null,
): MediaItem[] {
  const seen = new Set<string>();
  const result: MediaItem[] = [];

  const add = (media: MediaItem) => {
    if (!media.url || seen.has(media.url)) return;
    seen.add(media.url);
    result.push(media);
  };

  if (isUserUploadedImage(item.imageUrl) && item.imageUrl) {
    // Local `/uploads` paths are often provider downloads (barcode scan /
    // enrichment), not personal uploads. Only label "user"/"Perso" when a
    // gallery row (preferring catalog over an honor pin) actually backs the pin.
    const provenance = findAttachmentForUrl(
      item.metadata?.attachments ?? [],
      item.imageUrl,
    );
    add({
      url: item.imageUrl,
      type: provenance?.type ?? "image",
      source: provenance?.source ?? null,
      role: provenance?.role,
      title: provenance?.title,
      providerLabel: provenance?.providerLabel,
      sourceNames: provenance?.sourceNames,
    });
  }

  orderedCoverAttachmentsForDisplay(item, uiLocale).forEach(add);

  const resolvedDefault = resolveMetadataCoverUrl(item, uiLocale);
  if (resolvedDefault) {
    const alreadyListed = urlsReferToSameLocalizedImage(
      resolvedDefault,
      item.imageUrl ?? "",
    );
    if (!alreadyListed || !item.imageUrl) {
      add({ url: resolvedDefault, type: "cover" });
    }
  }

  const ranked = rankedAttachments(item, uiLocale);

  ranked.filter((attachment) => attachment.type === "screenshot").forEach(add);
  ranked.filter((attachment) => attachment.type === "artwork").forEach(add);
  ranked.filter((attachment) => attachment.type === "background").forEach(add);
  ranked.filter((attachment) => attachment.type === "logo").forEach(add);
  ranked.filter((attachment) => attachment.type === "image").forEach(add);

  if (item.imageUrl && !seen.has(item.imageUrl)) {
    add({ url: item.imageUrl, type: "image" });
  }

  return max ? result.slice(0, max) : result;
}

export { getMediaTypeLabel } from "@/core/enrich/media/attachmentDisplayLabels";

/** Score objectif d'un attachment (debug/admin, sans I/O). */
export function getAttachmentDisplayScore(
  attachment: ScoredAttachmentInput,
): number {
  return scoreAttachmentForDisplay(attachment);
}
