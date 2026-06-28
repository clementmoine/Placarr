/**
 * itemMedia.ts — Affichage média produit (cover, hero, galerie)
 *
 * Règle unique pour toute l'app :
 * - cover canonique = metadata.imageUrl (calculée à l'enregistrement)
 * - fallback legacy = scoring objectif sur les attachments (pas de priorité provider)
 * - photo utilisateur locale = override explicite
 */

import type { AttachmentType } from "@prisma/client";

import {
  isAttachmentCoverPlatformMismatch,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  rankCoverGalleryAttachments,
  scoreAttachmentForDisplay,
  shouldShowCoverAttachmentOnShelf,
  type AttachmentDisplayScoreOptions,
  type ScoredAttachmentInput,
} from "@/lib/media/attachmentDisplayScore";
import { detectShelfGamePlatformKey } from "@/lib/metadata/platform";
import { catalogAttachmentTitleConflicts } from "@/lib/metadata/titleMatching";
import { stripCropSuffixFromUrl, urlsReferToSameLocalizedImage } from "@/lib/media/coverUrl";
import {
  icollectCoverRegionFromAgeRating,
  icollectRoleWithoutCollectorRegion,
  isICollectAgeRatingFact,
  isICollectAttachmentSource,
} from "@/services/providers/icollect/imageLabels";
import { retailCatalogImageTitleSource } from "@/services/provider/sourceTraits";

export interface MediaItem {
  url: string;
  type: AttachmentType | string;
  source?: string | null;
  role?: string | null;
  title?: string | null;
  // Provider-derived display fields stamped server-side (see providerSourceTraits):
  // cover-scoring flags read by the scorer, plus the gallery chip label.
  isRealBoxCoverSource?: boolean;
  isFullWrapCoverSource?: boolean;
  isGameMediaGallerySource?: boolean;
  isMusicGallerySource?: boolean;
  isCanonicalCoverSource?: boolean;
  retailCatalogImageTitlesSource?: boolean;
  strictShelfPlatformCoverSource?: boolean;
  collectorCoverRegionFromAgeRatingSource?: boolean;
  providerLabel?: string;
}

export interface MediaInput {
  imageUrl?: string | null;
  metadata?: {
    imageUrl?: string | null;
    heroImageUrl?: string | null;
    sourceType?: string | null;
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

function coverDisplayOptions(item: MediaInput): AttachmentDisplayScoreOptions {
  return {
    requestedPlatformKey:
      item.shelf?.type === "games"
        ? detectShelfGamePlatformKey(item.shelf?.name)
        : undefined,
  };
}

function attachments(item: MediaInput): ScoredAttachmentInput[] {
  return (item.metadata?.attachments ?? []) as ScoredAttachmentInput[];
}

const COVER_GALLERY_TYPES = new Set(["cover", "artwork", "image"]);

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
>(metadata: T): T {
  const productTitle = metadata.title?.trim();
  if (!productTitle) return metadata;

  const attachments = (metadata.attachments ?? []).filter((attachment) => {
    if (!COVER_GALLERY_TYPES.has(attachment.type)) return true;
    if (!attachment.title?.trim()) return true;
    const retailCatalogTitles =
      attachment.retailCatalogImageTitlesSource ??
      retailCatalogImageTitleSource(attachment.source);
    if (!retailCatalogTitles) {
      return true;
    }
    return !catalogAttachmentTitleConflicts(productTitle, attachment.title);
  });

  return { ...metadata, attachments };
}

export function filterMetadataForShelfPlatform<
  T extends {
    title?: string | null;
    imageUrl?: string | null;
    attachments?: MediaItem[] | null;
  },
>(metadata: T | null | undefined, shelf?: MediaInput["shelf"]): T | undefined {
  if (!metadata) return undefined;

  const metadataForTitle = filterAttachmentsForProductTitle(metadata);
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
    if (
      !isICollectAttachmentSource(attachment.source) ||
      !attachment.role
    ) {
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
    return { ...metadataForTitle, attachments: attachmentsWithSanitizedICollect };
  }

  const filteredAttachments = coverAttachmentsMatchingShelfPlatform(
    attachmentsWithSanitizedICollect as ScoredAttachmentInput[],
    options,
  );

  const pinStillValid =
    !metadataForTitle.imageUrl ||
    filteredAttachments.some(
      (attachment) =>
        attachment.url &&
        urlsReferToSameLocalizedImage(
          attachment.url,
          metadataForTitle.imageUrl!,
        ),
    );

  const imageUrl = pinStillValid
    ? metadataForTitle.imageUrl
    : pickBestCoverFromAttachments(filteredAttachments, undefined, options) ??
      null;

  return {
    ...metadataForTitle,
    attachments: filteredAttachments,
    imageUrl: imageUrl ?? undefined,
  };
}

function coverAttachmentsMatchingShelfPlatform(
  list: ScoredAttachmentInput[],
  options: AttachmentDisplayScoreOptions,
): ScoredAttachmentInput[] {
  const platformKey = options.requestedPlatformKey;
  if (!platformKey) return list;

  return list.filter((attachment) => {
    if (!COVER_GALLERY_TYPES.has(attachment.type)) return true;
    return shouldShowCoverAttachmentOnShelf(attachment, platformKey);
  });
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
): ScoredAttachmentInput | undefined {
  return attachments(item).find(
    (attachment) =>
      attachment.url && urlsReferToSameLocalizedImage(attachment.url, url),
  );
}

/** metadata.imageUrl unless it explicitly targets another console than the shelf. */
export function resolveMetadataCoverUrl(item: MediaInput): string | null {
  const pin = item.metadata?.imageUrl;
  if (!pin) return null;

  const options = coverDisplayOptions(item);
  const attachment = attachmentForUrl(item, pin);
  if (
    attachment &&
    isAttachmentCoverPlatformMismatch(attachment, options.requestedPlatformKey)
  ) {
    return (
      pickBestCoverFromAttachments(
        attachments(item),
        undefined,
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
): ScoredAttachmentInput[] {
  const options = coverDisplayOptions(item);
  const covers = coverAttachmentsMatchingShelfPlatform(
    attachments(item).filter((attachment) =>
      COVER_GALLERY_TYPES.has(attachment.type),
    ),
    options,
  );
  if (covers.length === 0) return [];
  const ranked = rankCoverGalleryAttachments(covers, undefined, options);
  const pin = resolveMetadataCoverUrl(item);

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
): ScoredAttachmentInput[] {
  const options = coverDisplayOptions(item);
  const ordered = orderedCoverAttachmentsForDisplay(item);
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

function rankedAttachments(item: MediaInput): ScoredAttachmentInput[] {
  return rankAttachmentsForDisplay(
    attachments(item),
    undefined,
    coverDisplayOptions(item),
  );
}

/**
 * Retourne l'URL de la jaquette affichée partout dans l'app.
 * item.imageUrl = choix explicite utilisateur (upload ou galerie).
 * metadata.imageUrl = défaut calculé à l'enrichissement.
 */
export function getCoverImage(item: MediaInput): string | null {
  if (item.imageUrl) {
    return item.imageUrl;
  }

  const metadataCover = resolveMetadataCoverUrl(item);
  if (metadataCover) {
    return metadataCover;
  }

  const bestFromAttachments = pickBestCoverFromAttachments(
    attachments(item),
    undefined,
    coverDisplayOptions(item),
  );
  if (bestFromAttachments) return bestFromAttachments;

  return null;
}

export function getHeroImage(item: MediaInput): string | null {
  // Quality-ranked hero computed at enrichment time (sharp, landscape). Takes
  // precedence over the legacy type-order heuristic, which has no resolution
  // signal at display time.
  if (item.metadata?.heroImageUrl) return item.metadata.heroImageUrl;

  const ranked = rankedAttachments(item);
  const bg = ranked.find((attachment) => attachment.type === "background");
  if (bg) return bg.url;

  const artwork = ranked.find((attachment) => attachment.type === "artwork");
  if (artwork) return artwork.url;

  const screenshot = ranked.find(
    (attachment) => attachment.type === "screenshot",
  );
  if (screenshot) return screenshot.url;

  return getCoverImage(item);
}

export function getGalleryImages(item: MediaInput, max?: number): MediaItem[] {
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

  orderedCoverAttachmentsForDisplay(item).forEach(add);

  const resolvedDefault = resolveMetadataCoverUrl(item);
  if (resolvedDefault) {
    const alreadyListed = urlsReferToSameLocalizedImage(
      resolvedDefault,
      item.imageUrl ?? "",
    );
    if (!alreadyListed || !item.imageUrl) {
      add({ url: resolvedDefault, type: "cover" });
    }
  }

  const ranked = rankedAttachments(item);

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

export { getMediaTypeLabel } from "@/lib/media/attachmentDisplayLabels";

/** Score objectif d'un attachment (debug/admin, sans I/O). */
export function getAttachmentDisplayScore(
  attachment: ScoredAttachmentInput,
): number {
  return scoreAttachmentForDisplay(attachment);
}
