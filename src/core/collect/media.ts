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
  coverListHasShelfPlatformSignal,
  isAttachmentCoverPlatformMismatch,
  isCoverAmbiguousForShelfPlatform,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  rankCoverGalleryAttachments,
  scoreAttachmentForDisplay,
  shouldShowCoverAttachmentOnShelf,
  type AttachmentDisplayScoreOptions,
  type AttachmentImageMetrics,
  type ScoredAttachmentInput,
} from "@/core/enrich/media/attachmentDisplayScore";
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
  stripCropSuffixFromUrl,
  urlsReferToSameLocalizedImage,
  isCoverEligibleAttachmentType,
  isUrlEligibleDefaultCover,
} from "@/core/enrich/media/coverUrl";
import {
  icollectCoverRegionFromAgeRating,
  icollectRoleWithoutCollectorRegion,
  isICollectAgeRatingFact,
  isICollectAttachmentSource,
} from "@/providers/icollect/imageLabels";

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
  strictShelfPlatformCoverSource?: boolean;
  collectorCoverRegionFromAgeRatingSource?: boolean;
  coverProvenance?: string | null;
  // Persisted at enrichment from the original image URL; the platform-aware cover
  // ranking's load-bearing signal once the URL is a local /uploads path.
  platformKey?: string | null;
  providerLabel?: string | null;
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
  return new Date(updatedAt).getTime() > new Date(lastFetched).getTime();
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
  return {
    requestedPlatformKey:
      item.shelf?.type === "games"
        ? detectShelfGamePlatformKey(item.shelf?.name)
        : undefined,
    ...(resolvedLocale ? { uiLocale: resolvedLocale } : {}),
  };
}

/** Attachments carry their persisted image metrics (see `MediaItem`). */
type DisplayAttachment = ScoredAttachmentInput & PlaceholderCoverSignals;

function attachments(item: MediaInput): DisplayAttachment[] {
  return filterPlaceholderCoverAttachments(
    (item.metadata?.attachments ?? []) as DisplayAttachment[],
  );
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
    if (!attachment.retailCatalogImageTitlesSource) {
      return true;
    }
    return !catalogAttachmentTitleConflicts(productTitle, attachmentTitle, {
      mediaType: shelf?.type,
    });
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
    isCoverAmbiguousForShelfPlatform(pinnedAttachment, requestedPlatformKey) &&
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
        ) ??
        orphanMetadataImageUrlFallback(pinned, originalAttachments));
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
  const icollectAgeRating =
    (
      metadataForTitle as {
        facts?: Array<{ kind?: string; source?: string; value?: string }>;
      }
    ).facts?.find((fact) => isICollectAgeRatingFact(fact))?.value ?? null;
  const icollectRegionFromRating =
    icollectCoverRegionFromAgeRating(icollectAgeRating);
  const attachmentsWithSanitizedICollect = (
    metadataForTitle.attachments ?? []
  ).map((attachment) => {
    if (!isICollectAttachmentSource(attachment.source) || !attachment.role) {
      return attachment;
    }
    if (icollectRegionFromRating) return attachment;
    const stripped = icollectRoleWithoutCollectorRegion(attachment.role);
    return stripped
      ? { ...attachment, role: stripped }
      : { ...attachment, role: undefined };
  });

  const options = coverDisplayOptions({ shelf });
  if (!options.requestedPlatformKey) {
    return sanitizeDiscoveredBarcodeForShelf(
      reconcileImageUrlAfterAttachmentFilter(
        { ...metadataForTitle, attachments: attachmentsWithSanitizedICollect },
        attachmentsWithSanitizedICollect,
        options,
      ),
      options,
    );
  }

  const filteredAttachments = coverAttachmentsMatchingShelfPlatform(
    attachmentsWithSanitizedICollect as ScoredAttachmentInput[],
    options,
  );

  return sanitizeDiscoveredBarcodeForShelf(
    reconcileImageUrlAfterAttachmentFilter(
      { ...metadataForTitle, attachments: attachmentsWithSanitizedICollect },
      filteredAttachments,
      options,
      attachmentsWithSanitizedICollect,
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

function pinnedCoverNeedsPlatformFallback(
  item: MediaInput,
  pin: string,
  options: AttachmentDisplayScoreOptions,
  { honorUserOverride = false }: { honorUserOverride?: boolean } = {},
): boolean {
  const attachment = attachmentForUrl(item, pin);
  if (attachment?.source === "user") return false;
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
  // Promote a shelf-platform-matched cover to the default even when the current pin
  // is only platform-*ambiguous* (unidentified). The ambiguous cover stays in the
  // gallery — it just stops being the default. Known-mismatch pins were dropped above.
  const requestedPlatformKey = options.requestedPlatformKey;
  return (
    isVideoGamePlatformKey(requestedPlatformKey) &&
    isCoverAmbiguousForShelfPlatform(attachment, requestedPlatformKey) &&
    coverListHasShelfPlatformSignal(
      shelfCoverCandidates(attachments(item)),
      requestedPlatformKey,
    )
  );
}

function dedupeAttachmentsByImageUrl(
  list: ScoredAttachmentInput[],
): ScoredAttachmentInput[] {
  const seen = new Set<string>();
  const result: ScoredAttachmentInput[] = [];

  for (const attachment of list) {
    if (!attachment.url) continue;
    const key = stripCropSuffixFromUrl(attachment.url);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(attachment);
  }

  return result;
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

/** metadata.imageUrl unless it explicitly targets another console than the shelf. */
export function resolveMetadataCoverUrl(
  item: MediaInput,
  uiLocale?: Locale | null,
): string | null {
  const pin = item.metadata?.imageUrl;
  if (!pin || isMissingArtImageUrl(pin)) return null;

  const options = coverDisplayOptions(item, uiLocale);
  if (
    !isUrlEligibleDefaultCover(pin, attachments(item)) ||
    pinnedCoverNeedsPlatformFallback(item, pin, options)
  ) {
    return (
      pickBestCoverFromAttachments(
        coverAttachmentsMatchingShelfPlatform(attachments(item), options),
        persistedImageMetricsByUrl(item),
        options,
      ) ?? null
    );
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
  const pin = resolveMetadataCoverUrl(item, uiLocale);

  if (!pin) return dedupeAttachmentsByImageUrl(ranked);

  const pinned = ranked.filter(
    (attachment) =>
      attachment.url && urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  const rest = ranked.filter(
    (attachment) =>
      !attachment.url || !urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  return dedupeAttachmentsByImageUrl([...pinned, ...rest]);
}

/** Merge enrichment order with transient picker entries (scan / local crop). */
export function mergeCoverAttachmentsForPicker(
  item: MediaInput,
  pickerAttachments: ScoredAttachmentInput[],
  uiLocale?: Locale | null,
): ScoredAttachmentInput[] {
  const options = coverDisplayOptions(item, uiLocale);
  const ordered = orderedCoverAttachmentsForDisplay(item, uiLocale);
  const orderedUrls = new Set(
    ordered.map((attachment) =>
      attachment.url ? stripCropSuffixFromUrl(attachment.url) : "",
    ),
  );
  const shelfCovers = coverAttachmentsMatchingShelfPlatform(
    pickerAttachments.filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
    options,
  );
  const extras = shelfCovers.filter(
    (attachment) =>
      attachment.url &&
      !orderedUrls.has(stripCropSuffixFromUrl(attachment.url)),
  );
  const nonCovers = pickerAttachments.filter(
    (attachment) => !COVER_GALLERY_TYPES.has(attachment.type),
  );
  return [...extras, ...ordered, ...nonCovers];
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
 * item.imageUrl = choix explicite utilisateur (upload ou galerie).
 * metadata.imageUrl = défaut calculé à l'enrichissement.
 */
export function getCoverImage(
  item: MediaInput,
  uiLocale?: Locale | null,
): string | null {
  const options = coverDisplayOptions(item, uiLocale);
  const honorUserOverride = isExplicitUserCoverOverride(item);

  if (
    item.imageUrl &&
    isUrlEligibleDefaultCover(item.imageUrl, attachments(item)) &&
    !pinnedCoverNeedsPlatformFallback(item, item.imageUrl, options, {
      honorUserOverride,
    })
  ) {
    return item.imageUrl;
  }

  const metadataCover = resolveMetadataCoverUrl(item, uiLocale);
  if (metadataCover) {
    return metadataCover;
  }

  const bestFromAttachments = pickBestCoverFromAttachments(
    coverAttachmentsMatchingShelfPlatform(attachments(item), options),
    persistedImageMetricsByUrl(item),
    options,
  );
  if (bestFromAttachments) return bestFromAttachments;

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
    const provenance = item.metadata?.attachments?.find(
      (attachment) =>
        attachment.url &&
        urlsReferToSameLocalizedImage(attachment.url, item.imageUrl!),
    );
    add({
      url: item.imageUrl,
      type: provenance?.type ?? "image",
      source: provenance?.source ?? "user",
      role: provenance?.role,
      title: provenance?.title,
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
