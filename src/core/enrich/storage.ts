import {
  Attachment,
  AttachmentType,
  Author,
  Metadata,
  Publisher,
  Type,
} from "@prisma/client";
import path from "path";
import {
  deriveAttachmentPlatformKeyFromUrl,
  shouldShowCoverAttachmentOnShelf,
  shouldSuppressCoverOnPlatformShelf,
  pickBestBackgroundFromAttachments,
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  reorderAttachmentsCoverFirst,
  resolveStoredMetadataCoverUrl,
  type AttachmentImageMetrics,
} from "@/core/enrich/media/attachmentDisplayScore";
import { detectShelfGamePlatformKey } from "@/core/enrich/platform";
import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";
import { preserveGalleryAttachmentsOnRegression } from "@/core/enrich/galleryPreservation";
import { stampAttachmentsMissingPlatformKey } from "@/core/enrich/media/platformKeyStamp";
import { adoptItemNameFromMetadataIfPlaceholder } from "@/core/collect/adoptMetadataTitle";
import { resolveMetadataDisplayTitle } from "@/core/enrich/titles/refineCatalogDisplayTitle";
import {
  attachmentTitleMediaTypeConflicts,
  catalogAttachmentTitleConflicts,
  isMetadataTitleAligned,
} from "@/core/enrich/titleMatching";
import {
  urlsReferToSameLocalizedImage,
  isUrlEligibleDefaultCover,
  isCoverEligibleAttachmentType,
} from "@/core/enrich/media/coverUrl";
import {
  readFileImageMetrics,
  isCoverResolutionAcceptable,
} from "@/core/enrich/media/imageMetrics";
import {
  isMissingArtImageUrl,
  isPlaceholderCoverImage,
} from "@/core/enrich/media/coverPlaceholder";
import { isUnavailableCoverPlaceholderBuffer } from "@/core/enrich/media/coverPlaceholder.server";
import {
  trimLightImageMargins,
  cropImageIfNeeded,
} from "@/core/enrich/media/imageTrim";
import { PROVIDERS, providerModuleForCoverDownload } from "@/core/catalog/catalog";
import {
  canonicalProviderIdForSource,
  withProviderAttachmentTraits,
  authoritative3dCoverRoleSource,
  coverProvenanceForSource,
  gridStyleCoverLabelSource,
  inferProviderIdFromMediaUrl,
} from "@/core/catalog/sourceTraits";
import sharp from "sharp";
import { resolveAttachmentDisplayRegion } from "@/core/enrich/media/attachmentDisplayLabels";
import { measureCoverExposureFromBuffer } from "@/core/enrich/media/coverExposure.server";
import { regionRank } from "@/core/locale/preference";
import { resolveCoverAttachmentRole } from "@/core/enrich/media/coverPerspective";
import { barcodeListingMatchesItem } from "@/core/identify/titleUtils";
import { normalizeProductBarcode } from "@/core/identify/normalize";
import { inferImageAttachmentFromMediaUrl } from "@/core/catalog/catalog";
import { prisma } from "@/lib/db/prisma";
import { metadataFieldEvidence } from "@/core/enrich/facts";
import { runCpuBackgroundWork } from "@/core/collect/jobs/backgroundWorkQueue";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";
import type { Item } from "@prisma/client";
import { replaceFieldEvidence, mergeFieldEvidenceForStorage } from "@/core/enrich/evidence";
import crypto from "crypto";
import fs from "fs";
import { coverDownloadCandidates } from "@/core/enrich/media/coverDownloadCandidates";
import { fetchRemoteImageBuffer } from "@/core/enrich/media/remoteFetch";
import { providerOriginalImageUrl } from "@/core/enrich/imageUrls";

import {
  formatMetadataForStorage,
  toAttachmentCreateData,
} from "@/core/enrich/dbMapping";
import { syncPriceOfferExternalLinksForMetadata } from "@/core/enrich/persistProviderExternalLinks";
import { syncMetadataDisplayFactsFromFieldEvidence } from "@/core/enrich/metadataFactsProjection";
import {
  mergeMetadataFactsForStorage,
  parseMetadataFactsJson,
} from "@/core/enrich/metadataFactsMerge";
import { dedupeFacts } from "@/core/enrich/facts";

function isDisplayImageAttachment(attachment: {
  type?: AttachmentType | string | null;
  url?: string | null;
}) {
  return (
    Boolean(attachment.url) &&
    ["cover", "artwork", "image", "screenshot", "background"].includes(
      String(attachment.type || ""),
    )
  );
}

function hasMetadataImageCandidate(metadata: MetadataResult) {
  if (metadata.imageUrl) return true;
  return Boolean(metadata.attachments?.some(isDisplayImageAttachment));
}


export function metadataImageAttachmentSemantics(
  metadata: MetadataResult,
  originalImageUrl: string,
): Pick<MetadataAttachment, "type" | "role" | "source" | "title"> | null {
  const direct = metadata.attachments?.find(
    (attachment) => attachment.url === originalImageUrl,
  );
  const inferred = inferImageAttachmentFromMediaUrl(originalImageUrl);
  const inferredSource = inferProviderIdFromMediaUrl(originalImageUrl);

  if (!direct && !inferred && !inferredSource) return null;

  return {
    type: direct?.type ?? inferred?.type ?? "cover",
    role: direct?.role ?? inferred?.role,
    source: direct?.source ?? inferred?.source ?? inferredSource ?? undefined,
    title: direct?.title,
  };
}

function canUseBarcodeCacheCover(
  cached: {
    shelfType?: string | null;
    rawNames?: Array<{ value: string; coverUrl?: string | null }>;
  } | null,
  type: Type,
  metadata: MetadataResult,
  itemName: string,
  inferredCoverSemantics?: Pick<
    MetadataAttachment,
    "type" | "role" | "source" | "title"
  > | null,
) {
  if (cached?.shelfType !== type) return false;
  const barcodeListing = cached?.rawNames?.find(
    (entry) => entry.coverUrl,
  )?.value;
  if (barcodeListing && !barcodeListingMatchesItem(itemName, barcodeListing)) {
    return false;
  }
  if (!hasMetadataImageCandidate(metadata)) return true;
  return Boolean(inferredCoverSemantics?.source && inferredCoverSemantics.role);
}

export { isMissingMusicGallery } from "@/core/enrich/galleries";

export async function getCachedMetadata(
  itemId: Item["id"],
): Promise<(Metadata & { attachments: Attachment[] }) | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { metadata: { include: { attachments: true } } },
  });
  return item?.metadata || null;
}

export { looksLikeImageBuffer } from "@/core/enrich/media/imageBuffer";

export type CroppedCoverAttachmentSyncPlan =
  | { action: "update"; attachmentId: string; url: string }
  | { action: "create-user"; url: string }
  | { action: "noop" };

function findAttachmentForCandidateUrl(
  attachments: ReadonlyArray<{
    id: string;
    url: string;
    source: string | null;
  }>,
  candidateUrl: string | null | undefined,
) {
  const candidate = candidateUrl?.trim();
  if (!candidate) return undefined;
  return attachments.find(
    (attachment) =>
      attachment.url === candidate ||
      urlsReferToSameLocalizedImage(attachment.url, candidate),
  );
}

/**
 * Decide how to persist a newly cropped cover into the attachment gallery.
 * Never rewrite the *previous* cover row when the crop is a different image
 * (e.g. user picked gallery #2 that localized to a new /uploads path) — that
 * used to steal the old attachment URL and leave the displayed cover stuck.
 *
 * `source: "user"` / Perso is only for true personal art (file upload or URL
 * with no gallery twin). Selecting a provider cover — even after crop /
 * remote→local download — updates that provider row; it must not invent a
 * Perso duplicate beside the original jaquette.
 *
 * @param selectedImageUrl Gallery / form URL *before* `downloadRemoteImage`
 *   rewrote it to a UUID `/uploads` path. Remote PrestaShop covers only match
 *   via this argument.
 */
export function planCroppedCoverAttachmentSync(
  attachments: ReadonlyArray<{
    id: string;
    url: string;
    source: string | null;
  }>,
  croppedImageUrl: string,
  previousImageUrl?: string | null,
  selectedImageUrl?: string | null,
): CroppedCoverAttachmentSyncPlan[] {
  if (!croppedImageUrl.startsWith("/uploads/")) return [{ action: "noop" }];

  const plans: CroppedCoverAttachmentSyncPlan[] = [];
  const sameImageAsPrevious =
    !!previousImageUrl &&
    urlsReferToSameLocalizedImage(previousImageUrl, croppedImageUrl);

  const matchSameImage = attachments.find((attachment) =>
    urlsReferToSameLocalizedImage(attachment.url, croppedImageUrl),
  );
  if (matchSameImage && matchSameImage.url !== croppedImageUrl) {
    plans.push({
      action: "update",
      attachmentId: matchSameImage.id,
      url: croppedImageUrl,
    });
  } else if (!matchSameImage) {
    // Prefer the URL the collector just picked (pre-download). Falling back to
    // previousImageUrl alone used to miss remote→UUID folds and invent Perso.
    const selectedMatch = findAttachmentForCandidateUrl(
      attachments,
      selectedImageUrl,
    );
    if (selectedMatch && selectedMatch.url !== croppedImageUrl) {
      plans.push({
        action: "update",
        attachmentId: selectedMatch.id,
        url: croppedImageUrl,
      });
    } else if (sameImageAsPrevious && previousImageUrl) {
      const previousMatch = findAttachmentForCandidateUrl(
        attachments,
        previousImageUrl,
      );
      if (previousMatch && previousMatch.url !== croppedImageUrl) {
        plans.push({
          action: "update",
          attachmentId: previousMatch.id,
          url: croppedImageUrl,
        });
      }
    }
  }

  const existingUserPin = attachments.find(
    (attachment) => attachment.source === "user",
  );
  if (existingUserPin) {
    if (
      !urlsReferToSameLocalizedImage(existingUserPin.url, croppedImageUrl) &&
      !plans.some(
        (plan) =>
          plan.action === "update" && plan.attachmentId === existingUserPin.id,
      )
    ) {
      plans.push({
        action: "update",
        attachmentId: existingUserPin.id,
        url: croppedImageUrl,
      });
    }
  } else {
    const touchesProviderRow = plans.some((plan) => {
      if (plan.action !== "update") return false;
      const row = attachments.find(
        (attachment) => attachment.id === plan.attachmentId,
      );
      return Boolean(row && row.source !== "user");
    });
    const providerAlreadyHoldsCrop = attachments.some(
      (attachment) =>
        attachment.source !== "user" &&
        urlsReferToSameLocalizedImage(attachment.url, croppedImageUrl),
    );
    if (!touchesProviderRow && !providerAlreadyHoldsCrop) {
      plans.push({ action: "create-user", url: croppedImageUrl });
    }
  }

  return plans.length > 0 ? plans : [{ action: "noop" }];
}

/**
 * When a scan/create cover was client-localized to a UUID `/uploads` path, enrichment
 * later stores the same art under a provider-stamped hash path. Remap the pin to that
 * catalog row so the detail chip keeps ScreenScraper / Booknode instead of an orphan.
 */
export function pickVisuallyMatchingCatalogCoverUrl(
  pinHash: string,
  candidates: ReadonlyArray<{
    url: string;
    type?: string | null;
    source?: string | null;
    hash: string | null;
  }>,
  maxDistance: number = 8,
): string | null {
  for (const candidate of candidates) {
    const sourceKey = (candidate.source || "")
      .split(/[·/]/)[0]
      .toLowerCase()
      .trim();
    if (sourceKey === "user") continue;
    if (!isCoverEligibleAttachmentType(candidate.type)) continue;
    if (!candidate.hash) continue;
    if (hammingDistance(pinHash, candidate.hash) <= maxDistance) {
      return candidate.url;
    }
  }
  return null;
}

export async function syncCroppedCoverAttachment(
  metadataId: string,
  croppedImageUrl: string,
  previousImageUrl?: string | null,
  selectedImageUrl?: string | null,
): Promise<{ preferredImageUrl?: string }> {
  if (!croppedImageUrl.startsWith("/uploads/")) return {};

  const attachments = await prisma.attachment.findMany({
    where: { metadataId },
  });

  const plans = planCroppedCoverAttachmentSync(
    attachments,
    croppedImageUrl,
    previousImageUrl,
    selectedImageUrl,
  );

  let preferredImageUrl: string | undefined;

  for (const plan of plans) {
    if (plan.action === "update") {
      await prisma.attachment.update({
        where: { id: plan.attachmentId },
        data: { url: plan.url },
      });
      continue;
    }

    if (plan.action !== "create-user") continue;

    // Client-localized provider covers land as UUID `/uploads` files that do not
    // URL-match the catalog hash path. Fold the crop onto the visual twin —
    // never invent a Perso row for a gallery pick.
    const alreadyOnCatalogRow = attachments.some(
      (attachment) =>
        attachment.source !== "user" &&
        urlsReferToSameLocalizedImage(attachment.url, plan.url),
    );
    let catalogTwinId: string | null = null;
    let catalogTwinUrl: string | null = null;
    if (!alreadyOnCatalogRow) {
      const pinHash = await perceptualHashForAsset(plan.url);
      if (pinHash) {
        const candidates = await Promise.all(
          attachments
            .filter((attachment) => attachment.source !== "user")
            .map(async (attachment) => ({
              id: attachment.id,
              url: attachment.url,
              type: attachment.type,
              source: attachment.source,
              hash: await perceptualHashForAsset(attachment.url),
            })),
        );
        const catalogUrl = pickVisuallyMatchingCatalogCoverUrl(
          pinHash,
          candidates,
          PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
        );
        if (catalogUrl) {
          const twin = candidates.find((candidate) => candidate.url === catalogUrl);
          catalogTwinId = twin?.id ?? null;
          catalogTwinUrl = catalogUrl;
        }
      }
    }

    if (catalogTwinId && catalogTwinUrl) {
      if (catalogTwinUrl !== plan.url) {
        await prisma.attachment.update({
          where: { id: catalogTwinId },
          data: { url: plan.url },
        });
      }
      preferredImageUrl = plan.url;
      continue;
    }

    if (alreadyOnCatalogRow) {
      preferredImageUrl = plan.url;
      continue;
    }

    const existingUserPin = attachments.find(
      (attachment) => attachment.source === "user",
    );
    if (existingUserPin) {
      if (!urlsReferToSameLocalizedImage(existingUserPin.url, plan.url)) {
        await prisma.attachment.update({
          where: { id: existingUserPin.id },
          data: { url: plan.url },
        });
      }
    } else {
      await prisma.attachment.create({
        data: {
          metadataId,
          type: "image",
          url: plan.url,
          source: "user",
        },
      });
    }
  }

  // Enrichment may have added a catalog twin under another /uploads path after the
  // honor pin was created — collapse Perso onto that provider URL.
  let galleryAfter = await prisma.attachment.findMany({
    where: { metadataId },
  });

  // Perso crop beside a still-remote catalog default (failed remote→UUID fold):
  // move that catalog row onto the crop path and drop the Perso duplicate —
  // even when the gallery has several remotes (PriceCharting box set).
  const userCropPin = galleryAfter.find(
    (attachment) =>
      attachment.source === "user" &&
      urlsReferToSameLocalizedImage(attachment.url, croppedImageUrl),
  );
  const remoteCatalogCovers = galleryAfter.filter(
    (attachment) =>
      /^https?:\/\//i.test(attachment.url) &&
      attachment.source !== "user" &&
      ["cover", "artwork", "image"].includes(attachment.type),
  );
  const metadataCoverUrl = (
    await prisma.metadata.findUnique({
      where: { id: metadataId },
      select: { imageUrl: true },
    })
  )?.imageUrl;
  const remoteTwin =
    (metadataCoverUrl &&
      remoteCatalogCovers.find((attachment) =>
        urlsReferToSameLocalizedImage(attachment.url, metadataCoverUrl),
      )) ||
    (remoteCatalogCovers.length === 1 ? remoteCatalogCovers[0] : null) ||
    remoteCatalogCovers.find(
      (attachment) =>
        attachment.type === "cover" &&
        /^(main(\s+image)?|box(\s+front)?|front(\s+of\s+box)?)$/i.test(
          (attachment.title || "").trim(),
        ),
    ) ||
    null;
  if (userCropPin && remoteTwin) {
    const inferredSource =
      remoteTwin.source?.trim() || inferProviderIdFromMediaUrl(remoteTwin.url);
    await prisma.attachment.update({
      where: { id: remoteTwin.id },
      data: {
        url: croppedImageUrl,
        type: remoteTwin.type === "image" ? "cover" : remoteTwin.type,
        ...(inferredSource && !remoteTwin.source?.trim()
          ? { source: inferredSource }
          : {}),
      },
    });
    await prisma.attachment.delete({ where: { id: userCropPin.id } });
    preferredImageUrl = croppedImageUrl;
    galleryAfter = await prisma.attachment.findMany({
      where: { metadataId },
    });
  } else {
    // Catalog row already holds the crop — delete orphan Perso twins.
    const catalogHoldingCrop = galleryAfter.find(
      (attachment) =>
        attachment.source !== "user" &&
        urlsReferToSameLocalizedImage(attachment.url, croppedImageUrl),
    );
    if (catalogHoldingCrop) {
      for (const orphan of galleryAfter.filter(
        (attachment) =>
          attachment.source === "user" &&
          urlsReferToSameLocalizedImage(attachment.url, croppedImageUrl),
      )) {
        await prisma.attachment.delete({ where: { id: orphan.id } });
      }
      galleryAfter = await prisma.attachment.findMany({
        where: { metadataId },
      });
    }
  }

  const retargeted = await retargetUserHonorPinsInAttachmentGallery(galleryAfter);
  for (const attachment of retargeted) {
    const previous = galleryAfter.find((row) => row.id === attachment.id);
    if (!previous || previous.url === attachment.url) continue;
    await prisma.attachment.update({
      where: { id: attachment.id },
      data: { url: attachment.url },
    });
    preferredImageUrl = attachment.url;
  }

  const metadata = await prisma.metadata.findUnique({
    where: { id: metadataId },
    select: { imageUrl: true },
  });
  const coverForMetadata = preferredImageUrl ?? croppedImageUrl;
  if (
    metadata?.imageUrl &&
    urlsReferToSameLocalizedImage(metadata.imageUrl, croppedImageUrl)
  ) {
    await prisma.metadata.update({
      where: { id: metadataId },
      data: { imageUrl: coverForMetadata },
    });
  }

  return preferredImageUrl ? { preferredImageUrl } : {};
}

/**
 * If the collector's item.imageUrl is a personal /uploads file that enrichment
 * did not emit, fold it into the gallery as `source: "user"` so the next
 * deleteMany+create does not drop it.
 */
function injectOrphanUserCoverAttachment(
  item: {
    imageUrl?: string | null;
    updatedAt?: Date | string | null;
    metadata?: {
      imageUrl?: string | null;
      lastFetched?: Date | string | null;
      attachments?: Attachment[] | null;
    } | null;
  } | null,
  attachments: MetadataAttachment[],
): MetadataAttachment[] {
  const pin = item?.imageUrl?.trim();
  if (!pin?.startsWith("/uploads/")) return attachments;
  if (
    attachments.some((attachment) =>
      urlsReferToSameLocalizedImage(attachment.url, pin),
    )
  ) {
    return attachments;
  }

  const previous = item?.metadata?.attachments ?? [];
  const previousUser = previous.find(
    (attachment) =>
      attachment.source === "user" &&
      urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  const previousProviderHadPin = previous.some(
    (attachment) =>
      attachment.source !== "user" &&
      urlsReferToSameLocalizedImage(attachment.url, pin),
  );
  const metadataCover = item?.metadata?.imageUrl?.trim();
  const matchesMetadataCover =
    !!metadataCover && urlsReferToSameLocalizedImage(pin, metadataCover);

  // Stale enrichment crop / provider localize — do not relabel as user.
  if (previousProviderHadPin || matchesMetadataCover) {
    return attachments;
  }

  const savedAfterEnrichment =
    !!item?.updatedAt &&
    !!item?.metadata?.lastFetched &&
    new Date(item.updatedAt).getTime() >
      new Date(item.metadata.lastFetched).getTime();

  if (!previousUser && !savedAfterEnrichment) {
    return attachments;
  }

  return [
    {
      type: (previousUser?.type as MetadataAttachment["type"]) || "image",
      url: pin,
      source: "user",
      role: previousUser?.role ?? undefined,
      title: previousUser?.title ?? undefined,
      coverProvenance: previousUser?.coverProvenance ?? undefined,
      platformKey: previousUser?.platformKey ?? undefined,
    },
    ...attachments,
  ];
}

export type StoreMetadataOptions = {
  /** Persist remote URLs immediately; localize images in a background job. */
  deferImageLocalization?: boolean;
  /**
   * Progressive Pass-1 stores defer remote URLs for the UI but must not
   * schedule localization — a stale Pass-1 job can finish after Pass-2 and
   * wipe the richer gallery (LaunchBox discs, etc.).
   */
  skipDeferredLocalizationSchedule?: boolean;
  /**
   * When set (deferred localize jobs), abort the write if `lastFetched` moved
   * since this generation was scheduled.
   */
  expectLastFetched?: Date;
};

function cloneMetadataForImageLocalization(
  metadata: MetadataResult,
): MetadataResult {
  return {
    ...metadata,
    attachments: metadata.attachments?.map((attachment) => ({
      ...attachment,
    })),
    aliases: metadata.aliases ? [...metadata.aliases] : metadata.aliases,
    facts: metadata.facts ? [...metadata.facts] : metadata.facts,
    fieldEvidence: metadata.fieldEvidence
      ? metadata.fieldEvidence.map((entry) => ({ ...entry }))
      : metadata.fieldEvidence,
    authors: metadata.authors?.map((author) => ({ ...author })),
    publishers: metadata.publishers?.map((publisher) => ({ ...publisher })),
  };
}

function prepareDeferredAttachments(
  attachments: MetadataAttachment[],
): MetadataAttachment[] {
  return attachments.map((attachment) => {
    const sourceUrl = attachment.url;
    let role = attachment.role;
    if (attachment.type === "cover") {
      role =
        resolveCoverAttachmentRole({
          type: attachment.type,
          url: sourceUrl,
          title: attachment.title,
          role: attachment.role,
          source: attachment.source,
          authoritative3dCoverRoleSource: authoritative3dCoverRoleSource(
            attachment.source,
          ),
          gridStyleCoverLabelsSource: gridStyleCoverLabelSource(
            attachment.source,
          ),
        }) ?? role;
    }

    return {
      ...attachment,
      role,
      coverProvenance:
        coverProvenanceForSource(attachment.source, sourceUrl) ??
        attachment.coverProvenance,
      platformKey:
        deriveAttachmentPlatformKeyFromUrl(sourceUrl) ??
        attachment.platformKey,
    };
  });
}

/** Prefer covers/heroes over screenshot grids when capping downloads. */
function attachmentLocalizationPriority(
  attachment: MetadataAttachment,
): number {
  const type = (attachment.type || "").toLowerCase();
  const role = (attachment.role || "").toLowerCase();
  if (type === "cover" || role.includes("cover") || role.includes("box")) {
    return 0;
  }
  if (
    type === "hero" ||
    role.includes("hero") ||
    role.includes("background")
  ) {
    return 1;
  }
  if (type === "logo" || role.includes("logo")) return 2;
  if (type === "screenshot" || role.includes("screenshot")) return 4;
  return 3;
}

/**
 * Cap remote downloads per metadata store. Full provider galleries (SteamGridDB,
 * ScreenScraper, …) routinely exceed 30 assets and dominated worker wall time.
 * Non-selected remotes stay as https URLs in the gallery.
 */
export const MAX_ATTACHMENTS_TO_LOCALIZE = 12;

export function selectAttachmentsForLocalization(
  attachments: MetadataAttachment[],
  limit = MAX_ATTACHMENTS_TO_LOCALIZE,
): MetadataAttachment[] {
  const remote = attachments.filter((attachment) =>
    /^https?:\/\//i.test(attachment.url),
  );
  if (remote.length <= limit) return remote;
  return [...remote]
    .sort(
      (left, right) =>
        attachmentLocalizationPriority(left) -
        attachmentLocalizationPriority(right),
    )
    .slice(0, limit);
}

function scheduleDeferredMetadataImageLocalization(
  itemId: Item["id"],
  metadata: MetadataResult,
  type: Type,
  name: string,
  metadataId: string,
  fetchedAt: Date,
): void {
  // Image localization runs sharp (resize/analysis) — CPU-bound work that must
  // stay on the low-concurrency pool so it never blocks interactive requests.
  void runCpuBackgroundWork(async () => {
    const stillCurrentGeneration = async () => {
      const current = await prisma.metadata.findUnique({
        where: { id: metadataId },
        select: { lastFetched: true },
      });
      return (
        Boolean(current?.lastFetched) &&
        current!.lastFetched!.getTime() === fetchedAt.getTime()
      );
    };

    if (!(await stillCurrentGeneration())) {
      return;
    }

    try {
      await storeMetadata(itemId, metadata, type, name, {
        deferImageLocalization: false,
        // Refuse to commit if a newer store landed while we were downloading.
        expectLastFetched: fetchedAt,
      });
    } catch (error) {
      console.error(
        `[MetadataStorage] Deferred image localization failed for item ${itemId}:`,
        error,
      );
    }
  });
}

export async function storeMetadata(
  itemId: Item["id"],
  metadata: MetadataResult,
  type: Type,
  name: string,
  options: StoreMetadataOptions = {},
): Promise<
  Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  }
> {
  const deferImageLocalization = options.deferImageLocalization ?? false;
  const metadataSnapshotForLocalization = deferImageLocalization
    ? cloneMetadataForImageLocalization(metadata)
    : null;
  const originalMetadataImageUrl = metadata.imageUrl;
  const metadataImageSemantics = originalMetadataImageUrl
    ? metadataImageAttachmentSemantics(metadata, originalMetadataImageUrl)
    : null;

  if (metadata.imageUrl && !deferImageLocalization) {
    metadata.imageUrl =
      (await downloadRemoteImage(metadata.imageUrl, { itemId })) || undefined;
  }

  const formattedMetadata = await formatMetadataForStorage(
    metadata,
    type,
    name,
  );

  const now = new Date();

  // First, get the existing metadata if any
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      shelf: { select: { name: true, type: true } },
      metadata: {
        include: { attachments: true, authors: true, publishers: true },
      },
    },
  });

  const requestedPlatformKey =
    type === "games"
      ? detectShelfGamePlatformKey(item?.shelf?.name)
      : undefined;

  const attachmentsList = stampAttachmentsMissingPlatformKey(
    (metadata.attachments || []).map((attachment) =>
      withProviderAttachmentTraits(attachment),
    ),
    metadata.platformKey ?? requestedPlatformKey,
  );
  if (metadata.imageUrl) {
    const exists = attachmentsList.some(
      (attachment) => attachment.url === metadata.imageUrl,
    );
    if (!exists) {
      attachmentsList.unshift(
        withProviderAttachmentTraits({
          type: metadataImageSemantics?.type ?? "cover",
          url: metadata.imageUrl,
          role: metadataImageSemantics?.role,
          source: metadataImageSemantics?.source ?? undefined,
          title: metadataImageSemantics?.title,
        }),
      );
    }
  }
  if (item?.barcode) {
    const cleanedBarcode = item.barcode.replace(/[^\d]/g, "").trim();
    if (cleanedBarcode) {
      const cached = await prisma.barcodeCache.findUnique({
        where: { barcode: cleanedBarcode },
        include: { rawNames: true },
      });
      if (cached) {
        const barcodeCover = cached.rawNames.find(
          (rn) => rn.coverUrl,
        )?.coverUrl;
        const barcodeCoverSemantics = barcodeCover
          ? metadataImageAttachmentSemantics(
              { imageUrl: barcodeCover },
              barcodeCover,
            )
          : null;
        if (
          barcodeCover &&
          canUseBarcodeCacheCover(
            cached,
            type,
            metadata,
            name,
            barcodeCoverSemantics,
          )
        ) {
          const exists = attachmentsList.some((a) => a.url === barcodeCover);
          if (!exists) {
            attachmentsList.unshift(
              withProviderAttachmentTraits({
                type:
                  barcodeCoverSemantics?.type ?? ("cover" as AttachmentType),
                url: barcodeCover,
                role: barcodeCoverSemantics?.role,
                source: barcodeCoverSemantics?.source ?? "barcode",
                title: barcodeCoverSemantics?.title,
              }),
            );
          }
        }
      }
    }
  }

  // Deduplicate attachments by URL
  const uniqueAttachments = attachmentsList.filter(
    (attachment, index, self) =>
      index === self.findIndex((a) => a.url === attachment.url),
  );

  // Localize a ranked subset — full SteamGridDB/SS galleries (30+ assets) used
  // to dominate metadata wall time. Non-selected remotes stay as https URLs.
  const localizeUrls = new Set(
    selectAttachmentsForLocalization(uniqueAttachments).map(
      (attachment) => attachment.url,
    ),
  );

  let attachmentsForRanking = deferImageLocalization
    ? prepareDeferredAttachments(uniqueAttachments)
    : (
        await Promise.all(
          uniqueAttachments.map(async (attachment) => {
            const sourceUrl = attachment.url;
            const shouldLocalize =
              localizeUrls.has(sourceUrl) && /^https?:\/\//i.test(sourceUrl);

            let nextUrl = sourceUrl;
            if (shouldLocalize) {
              const localizedUrl = await downloadRemoteImage(sourceUrl, {
                source: attachment.source,
                itemId,
                metadataId: item?.metadata?.id,
              });
              // Keep the remote URL when localize fails (CloudFront / Flare
              // blips) so marketplace covers still appear in the gallery.
              if (localizedUrl) nextUrl = localizedUrl;
            }

            let role = attachment.role;
            if (attachment.type === "cover") {
              role =
                resolveCoverAttachmentRole({
                  type: attachment.type,
                  url: sourceUrl,
                  title: attachment.title,
                  role: attachment.role,
                  source: attachment.source,
                  authoritative3dCoverRoleSource:
                    authoritative3dCoverRoleSource(attachment.source),
                  gridStyleCoverLabelsSource: gridStyleCoverLabelSource(
                    attachment.source,
                  ),
                }) ?? role;
            }

            return {
              ...attachment,
              url: nextUrl,
              role,
              coverProvenance:
                coverProvenanceForSource(attachment.source, sourceUrl) ??
                attachment.coverProvenance,
              // Derive from the *original* remote URL — the local /uploads path it
              // is about to become no longer carries the platform signal.
              platformKey:
                deriveAttachmentPlatformKeyFromUrl(sourceUrl) ??
                attachment.platformKey,
            };
          }),
        )
      ).filter((a): a is NonNullable<typeof a> => a !== null);

  if (!deferImageLocalization) {
    attachmentsForRanking = await filterOutFlatImageAttachments(
      attachmentsForRanking,
    );
  }

  if (
    attachmentsForRanking.length === 0 &&
    item?.metadata?.attachments?.length
  ) {
    attachmentsForRanking = item.metadata.attachments
      .filter((attachment) => attachment.url.startsWith("/uploads/"))
      .map((attachment) => ({
        type: attachment.type,
        url: attachment.url,
        role: attachment.role ?? undefined,
        source: attachment.source ?? undefined,
        title: attachment.title ?? undefined,
        coverProvenance: attachment.coverProvenance ?? undefined,
        platformKey: attachment.platformKey ?? undefined,
      }));
  }

  const previousLocalCoverRaw = item?.metadata?.imageUrl?.startsWith(
    "/uploads/",
  )
    ? item.metadata.imageUrl
    : item?.imageUrl?.startsWith("/uploads/")
      ? item.imageUrl
      : null;
  const previousLocalCover =
    previousLocalCoverRaw &&
    isCoverResolutionAcceptable(
      await readFileImageMetrics(
        path.join(process.cwd(), "public", previousLocalCoverRaw),
      ),
    )
      ? previousLocalCoverRaw
      : null;

  const imageMetricsByUrl = new Map<string, AttachmentImageMetrics | null>();
  if (!deferImageLocalization) {
    await Promise.all(
      attachmentsForRanking
        .filter((attachment) =>
          shouldReadImageMetricsForAttachment(attachment.type),
        )
        .map(async (attachment) => {
          imageMetricsByUrl.set(
            attachment.url,
            await readAttachmentImageMetrics(attachment.url),
          );
        }),
    );
  }

  // Stamp the provider-declared cover traits onto each attachment so the display
  // scorer (and the client, via the stored payload) ranks the box cover / full
  // wrap signals without reading the registry.
  const rankedLocalizedAttachments = await dedupeLocalizedAttachmentsByContent(
    reorderAttachmentsCoverFirst(
      rankAttachmentsForDisplay(
        attachmentsForRanking.map(withProviderAttachmentTraits),
        imageMetricsByUrl,
        { requestedPlatformKey },
      ),
      imageMetricsByUrl,
      { requestedPlatformKey },
    ),
  );
  const storableAttachments = (
    requestedPlatformKey
      ? (() => {
          const coverCandidates = rankedLocalizedAttachments.filter(
            (attachment) =>
              ["cover", "artwork", "image"].includes(attachment.type),
          );
          return rankedLocalizedAttachments.filter((attachment) => {
            if (!["cover", "artwork", "image"].includes(attachment.type)) {
              return true;
            }
            return shouldShowCoverAttachmentOnShelf(
              attachment,
              requestedPlatformKey,
              coverCandidates,
            );
          });
        })()
      : rankedLocalizedAttachments
  ).filter((attachment) => {
    if (!["cover", "artwork", "image"].includes(attachment.type)) return true;
    if (!attachment.title?.trim()) return true;
    const catalogTitle = formattedMetadata.title || name;
    if (
      attachmentTitleMediaTypeConflicts(catalogTitle, attachment.title, {
        mediaType: type,
      })
    ) {
      return false;
    }
    if (!attachment.retailCatalogImageTitlesSource) {
      return true;
    }
    return !catalogAttachmentTitleConflicts(catalogTitle, attachment.title, {
      mediaType: type,
    });
  });

  const withOrphanUserPins = preserveGalleryAttachmentsOnRegression(
    item?.metadata?.attachments,
    injectOrphanUserCoverAttachment(item, storableAttachments),
    requestedPlatformKey,
  );
  const finalStorableAttachments =
    await retargetUserHonorPinsInAttachmentGallery(withOrphanUserPins);

  const canonicalCoverCandidate = finalStorableAttachments.find(
    (attachment) =>
      attachment.isCanonicalCoverSource && attachment.type === "cover",
  );
  const canonicalCover =
    canonicalCoverCandidate &&
    (deferImageLocalization ||
      isCoverResolutionAcceptable(
        imageMetricsByUrl.get(canonicalCoverCandidate.url) ?? null,
      ))
      ? canonicalCoverCandidate
      : undefined;
  const metadataCoverFallback =
    formattedMetadata.imageUrl &&
    isUrlEligibleDefaultCover(formattedMetadata.imageUrl, finalStorableAttachments)
      ? formattedMetadata.imageUrl
      : null;
  const scoredImageUrl =
    canonicalCover?.url ??
    pickBestCoverFromAttachments(finalStorableAttachments, imageMetricsByUrl, {
      requestedPlatformKey,
    }) ??
    metadataCoverFallback ??
    (previousLocalCover &&
    requestedPlatformKey &&
    shouldSuppressCoverOnPlatformShelf(
      attachmentsForRanking.find(
        (attachment) => attachment.url === previousLocalCover,
      ) ?? { type: "cover", url: previousLocalCover },
      finalStorableAttachments.filter((attachment) =>
        ["cover", "artwork", "image"].includes(attachment.type),
      ),
      requestedPlatformKey,
    )
      ? null
      : previousLocalCover) ??
    null;

  const selectedImageUrl = resolveStoredMetadataCoverUrl(
    scoredImageUrl,
    finalStorableAttachments,
    imageMetricsByUrl,
    { requestedPlatformKey },
  );

  const croppedImageUrl = selectedImageUrl
    ? await cropImageIfNeeded(selectedImageUrl, { minMarginPixels: 30 })
    : null;

  // Cropping writes a new "_crop" file, so the cover URL stored on the item /
  // metadata would no longer match any gallery attachment. Repoint the source
  // attachment at the cropped file so the cover keeps its provenance
  // (source + region role) instead of surfacing as an orphan "Scan" image.
  if (
    croppedImageUrl &&
    selectedImageUrl &&
    croppedImageUrl !== selectedImageUrl
  ) {
    const coverAttachment = finalStorableAttachments.find(
      (attachment) => attachment.url === selectedImageUrl,
    );
    if (coverAttachment) coverAttachment.url = croppedImageUrl;
  }

  metadata.imageUrl = croppedImageUrl || undefined;

  // Computed wide hero/background: the sharpest landscape image we have (reuses
  // the display scorer + the metrics already gathered above). Null when nothing
  // high-resolution qualifies, so the UI falls back to the legacy heuristic.
  const heroImageUrl = pickBestBackgroundFromAttachments(
    finalStorableAttachments,
    imageMetricsByUrl,
  );
  metadata.heroImageUrl = heroImageUrl || undefined;

  const mergedFacts = item?.metadata
    ? mergeMetadataFactsForStorage(
        parseMetadataFactsJson(item.metadata.facts),
        metadata.facts ?? [],
        {
          itemBarcode: item.barcode,
          itemTitle: item.name?.trim() || name.trim() || undefined,
          shelfType: type,
        },
      )
    : (metadata.facts ?? []);
  const dedupedMergedFacts = dedupeFacts(mergedFacts);
  const mergedFactsJson = dedupedMergedFacts
    ? JSON.stringify(dedupedMergedFacts)
    : null;

  const metadataData = {
    ...formattedMetadata,
    facts: mergedFactsJson,
    imageUrl: croppedImageUrl,
    heroImageUrl,
    lastFetched: now,
    updatedAt: now,
  };

  let storedMetadata: Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  };

  if (options.expectLastFetched && item?.metadata) {
    const current = await prisma.metadata.findUnique({
      where: { id: item.metadata.id },
      select: { lastFetched: true },
    });
    if (
      !current?.lastFetched ||
      current.lastFetched.getTime() !== options.expectLastFetched.getTime()
    ) {
      // A newer store landed while we localized — keep it.
      return {
        ...item.metadata,
        attachments: item.metadata.attachments,
        authors: item.metadata.authors,
        publishers: item.metadata.publishers,
      };
    }
  }

  if (item?.metadata) {
    storedMetadata = await prisma.metadata.update({
      where: { id: item.metadata.id },
      data: {
        ...metadataData,
        attachments: {
          deleteMany: {},
          create: finalStorableAttachments.map((attachment) =>
            toAttachmentCreateData(
              attachment,
              imageMetricsByUrl.get(attachment.url),
            ),
          ),
        },
        authors: {
          set: [], // Disconnect all existing authors
          connectOrCreate: formattedMetadata.authors?.connectOrCreate || [],
        },
        publishers: {
          set: [], // Disconnect all existing publishers
          connectOrCreate: formattedMetadata.publishers?.connectOrCreate || [],
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  } else {
    // Create new metadata and connect it to the item
    storedMetadata = await prisma.metadata.create({
      data: {
        ...metadataData,
        items: {
          connect: { id: itemId },
        },
        attachments: {
          create: finalStorableAttachments.map((attachment) =>
            toAttachmentCreateData(
              attachment,
              imageMetricsByUrl.get(attachment.url),
            ),
          ),
        },
      },
      include: { attachments: true, authors: true, publishers: true },
    });
  }

  const incomingEvidence =
    metadata.fieldEvidence && metadata.fieldEvidence.length > 0
      ? metadata.fieldEvidence
      : metadataFieldEvidence("MergedEngine", metadata, {
          confidence: 0.72,
          priority: 100,
        });

  const previousEvidence =
    item?.metadata?.id
      ? await prisma.fieldEvidence.findMany({
          where: { metadataId: item.metadata.id },
        })
      : [];

  const evidence = mergeFieldEvidenceForStorage(
    previousEvidence.map((row) => ({
      field: row.field,
      source: row.source,
      value: row.value,
      normalizedValue: row.normalizedValue,
      rawValue: row.rawValue,
      confidence: row.confidence,
      priority: row.priority,
      sourceUrl: row.sourceUrl,
      locale: row.locale,
      region: row.region,
      observedAt: row.observedAt,
    })),
    incomingEvidence,
  );

  await replaceFieldEvidence(
    {
      itemId,
      metadataId: storedMetadata.id,
    },
    evidence,
  );

  if (item && croppedImageUrl) {
    const previousMetadataImage = item.metadata?.imageUrl || null;
    const itemCoverStillInGallery = finalStorableAttachments.some(
      (attachment) => attachment.url === item.imageUrl,
    );
    const itemCoverMetrics = item.imageUrl?.startsWith("/uploads/")
      ? (imageMetricsByUrl.get(item.imageUrl) ??
        (await readFileImageMetrics(
          path.join(process.cwd(), "public", item.imageUrl),
        )))
      : null;
    const itemCoverIsLowRes =
      Boolean(item.imageUrl) && !isCoverResolutionAcceptable(itemCoverMetrics);
    const userCoverSavedAfterEnrichment =
      item.updatedAt &&
      item.metadata?.lastFetched &&
      new Date(item.updatedAt).getTime() >
        new Date(item.metadata.lastFetched).getTime();
    const itemCoverIsUserAttachment = finalStorableAttachments.some(
      (attachment) =>
        attachment.source === "user" &&
        item.imageUrl &&
        urlsReferToSameLocalizedImage(attachment.url, item.imageUrl),
    );
    let visualCatalogMatchUrl: string | null = null;
    if (
      item.imageUrl?.startsWith("/uploads/") &&
      !itemCoverStillInGallery &&
      !itemCoverIsUserAttachment
    ) {
      const pinHash = await perceptualHashForAsset(item.imageUrl);
      if (pinHash) {
        const candidates = await Promise.all(
          finalStorableAttachments.map(async (attachment) => ({
            url: attachment.url,
            type: attachment.type,
            source: attachment.source,
            hash: await perceptualHashForAsset(attachment.url),
          })),
        );
        visualCatalogMatchUrl = pickVisuallyMatchingCatalogCoverUrl(
          pinHash,
          candidates,
          PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
        );
      }
    }
    const shouldSyncItemCover =
      !itemCoverIsUserAttachment &&
      (!item.imageUrl ||
        item.imageUrl === previousMetadataImage ||
        item.imageUrl === croppedImageUrl ||
        (itemCoverIsLowRes && !userCoverSavedAfterEnrichment) ||
        Boolean(visualCatalogMatchUrl) ||
        attachmentsForRanking.some(
          (attachment) =>
            attachment.source === "barcode" &&
            attachment.url === item.imageUrl,
        ) ||
        (type === "musics" &&
          !itemCoverStillInGallery &&
          finalStorableAttachments.some(
            (attachment) => attachment.isCanonicalCoverSource,
          )));
    if (shouldSyncItemCover) {
      await prisma.item.update({
        where: { id: itemId },
        data: { imageUrl: visualCatalogMatchUrl ?? croppedImageUrl },
      });
    }
  } else if (item && previousLocalCover && !item.imageUrl) {
    await prisma.item.update({
      where: { id: itemId },
      data: { imageUrl: previousLocalCover },
    });
  }

  // Fill item.barcode only when the collector left it empty and the discovered
  // EAN is identity-safe (title-aligned + no platform conflict on games shelves).
  // Never overwrite a user-entered barcode.
  const discoveredBarcode = normalizeProductBarcode(metadata.barcode);
  const itemName = name.trim() || item?.name?.trim() || "";
  const metadataPlatformKey =
    metadata.platformKey && isVideoGamePlatformKey(metadata.platformKey)
      ? metadata.platformKey
      : detectVideoGamePlatformKey(metadata.platformKey ?? "");
  const discoveredBarcodePlatformConflicts = Boolean(
    requestedPlatformKey &&
      metadataPlatformKey &&
      metadataPlatformKey !== requestedPlatformKey,
  );
  let effectiveBarcode = normalizeProductBarcode(item?.barcode);
  if (
    item &&
    discoveredBarcode &&
    !effectiveBarcode &&
    !discoveredBarcodePlatformConflicts &&
    itemName &&
    metadata.title &&
    isMetadataTitleAligned({ title: metadata.title }, [itemName], 0.58)
  ) {
    await prisma.item.update({
      where: { id: itemId },
      data: { barcode: discoveredBarcode },
    });
    effectiveBarcode = discoveredBarcode;
  }

  if (item && heroImageUrl) {
    const previousHero = item.metadata?.heroImageUrl || null;
    const shouldSyncBackground =
      !item.backgroundImageUrl ||
      item.backgroundImageUrl === previousHero ||
      item.backgroundImageUrl === heroImageUrl;
    if (shouldSyncBackground) {
      await prisma.item.update({
        where: { id: itemId },
        data: { backgroundImageUrl: heroImageUrl },
      });
    }
  }

  // Fill item.name only when empty / barcode placeholder and a barcode is set.
  if (item) {
    const displayTitle = resolveMetadataDisplayTitle(metadata, effectiveBarcode);
    await adoptItemNameFromMetadataIfPlaceholder({
      itemId,
      metadataTitle: displayTitle,
      itemName: item.name?.trim() || name.trim(),
      barcode: effectiveBarcode,
    });
  }

  if (
    deferImageLocalization &&
    !options.skipDeferredLocalizationSchedule &&
    metadataSnapshotForLocalization &&
    storedMetadata.lastFetched
  ) {
    scheduleDeferredMetadataImageLocalization(
      itemId,
      metadataSnapshotForLocalization,
      type,
      name,
      storedMetadata.id,
      storedMetadata.lastFetched,
    );
  }

  try {
    await syncPriceOfferExternalLinksForMetadata({
      metadataId: storedMetadata.id,
      itemId,
      itemBarcode: item?.barcode,
      itemTitle: item?.name?.trim() || name.trim() || undefined,
      shelfType: type,
    });
  } catch (error) {
    console.warn(
      `[Metadata] Price-offer external-link sync failed for item ${itemId}:`,
      error,
    );
  }

  try {
    await syncMetadataDisplayFactsFromFieldEvidence({
      metadataId: storedMetadata.id,
      itemBarcode: item?.barcode,
      itemTitle: item?.name?.trim() || name.trim() || undefined,
    });
  } catch (error) {
    console.warn(
      `[Metadata] Field-evidence fact projection failed for item ${itemId}:`,
      error,
    );
  }

  return storedMetadata;
}

// ── coalesced from src/core/enrich/imageDownload.ts ──
/**
 * Remote cover acquisition: localize a remote image URL into `public/uploads`
 * (dedupe by content hash, upgrade to the provider's original, reject
 * placeholders/sub-threshold scans, optional margin trim) and decide when a
 * remote URL may be kept as-is on download failure. Split out of `storage.ts`;
 * `storeMetadata` still calls `downloadRemoteImage`, and the public symbols are
 * re-exported from `storage.ts` for existing consumers.
 */

function providerMatchesImageUrl(
  provider: { coverUrlHost?: string | null },
  url: string,
): boolean {
  if (!provider.coverUrlHost) return false;
  return url.includes(provider.coverUrlHost);
}

function remoteImageFallbackProviderFor(url: string, source?: string | null) {
  const sourceProviderId = canonicalProviderIdForSource(source);
  if (sourceProviderId) {
    const provider = PROVIDERS.find((p) => p.id === sourceProviderId);
    if (
      provider?.remoteImageFallback &&
      providerMatchesImageUrl(provider, url)
    ) {
      return provider;
    }
  }

  return PROVIDERS.find(
    (provider) =>
      provider.remoteImageFallback && providerMatchesImageUrl(provider, url),
  );
}

export function canKeepRemoteImageOnDownloadFailure(
  url: string,
  source?: string | null,
): boolean {
  if (!url || url.startsWith("/") || !/^https?:\/\//i.test(url)) return false;
  return Boolean(remoteImageFallbackProviderFor(url, source));
}

const LOCAL_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
];

async function existingLocalizedUploadForUrl(
  url: string,
): Promise<string | null> {
  const targetDir = path.join(process.cwd(), "public", "uploads");
  const candidates = coverDownloadCandidates(url);

  for (const candidate of candidates) {
    const hash = crypto.createHash("md5").update(candidate).digest("hex");
    for (const ext of LOCAL_IMAGE_EXTENSIONS) {
      const targetPath = path.join(targetDir, `${hash}${ext}`);
      if (!fs.existsSync(targetPath)) continue;
      return `/uploads/${hash}${ext}`;
    }
  }

  return null;
}

export async function downloadRemoteImage(
  url: string,
  options: {
    trim?: boolean;
    minMarginPixels?: number;
    source?: string | null;
    itemId?: string;
    metadataId?: string;
  } = {},
): Promise<string | null> {
  if (!url) return null;
  if (isMissingArtImageUrl(url)) return null;
  if (url.startsWith("file://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return url.startsWith("/uploads/") ? url : null;
  }
  if (!url.startsWith("http")) {
    return null;
  }

  const persistRemoteFallback = () =>
    canKeepRemoteImageOnDownloadFailure(url, options.source) ? url : null;

  const coverOwner = providerModuleForCoverDownload(url);
  if (coverOwner?.localizeCoverDownload) {
    return (
      (await coverOwner.localizeCoverDownload(url, {
        source: options.source,
        itemId: options.itemId,
        metadataId: options.metadataId,
        trim: options.trim,
      })) ?? persistRemoteFallback()
    );
  }

  const existingLocalized = await existingLocalizedUploadForUrl(url);
  if (existingLocalized) {
    return existingLocalized;
  }

  try {
    const hash = crypto.createHash("md5").update(url).digest("hex");
    const targetDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const original = providerOriginalImageUrl(url);
    const fetched =
      (await fetchRemoteImageBuffer(url)) ||
      (original && original !== url
        ? await fetchRemoteImageBuffer(original)
        : null);
    if (!fetched) {
      return (
        (await existingLocalizedUploadForUrl(url)) ?? persistRemoteFallback()
      );
    }

    const parsedUrl = new URL(fetched.sourceUrl);
    let ext = path.extname(parsedUrl.pathname);
    if (
      !ext ||
      ![".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(
        ext.toLowerCase(),
      )
    ) {
      ext = ".jpg";
    }

    const filename = `${hash}${ext}`;
    const targetPath = path.join(targetDir, filename);
    if (fs.existsSync(targetPath)) {
      const existingBuffer = fs.readFileSync(targetPath);
      if (await isUnavailableCoverPlaceholderBuffer(existingBuffer)) {
        fs.unlinkSync(targetPath);
      } else {
        return `/uploads/${filename}`;
      }
    }

    let imageBuffer = fetched.buffer;
    if (await isUnavailableCoverPlaceholderBuffer(imageBuffer)) {
      console.info(
        `[ImageLocalizer] Rejected unavailable-art placeholder from ${fetched.sourceUrl}`,
      );
      return persistRemoteFallback();
    }
    if (options.trim) {
      imageBuffer = await trimLightImageMargins(imageBuffer, {
        minMarginPixels: options.minMarginPixels,
      });
    }
    fs.writeFileSync(targetPath, imageBuffer);
    console.log(
      `[ImageLocalizer] Downloaded ${fetched.sourceUrl} -> ${targetPath}`,
    );
    return `/uploads/${filename}`;
  } catch (err) {
    console.error(
      `[ImageLocalizer] Failed to download image from ${url}:`,
      err instanceof Error ? err.message : String(err),
    );
    return persistRemoteFallback();
  }
}

// ── coalesced from src/core/enrich/imageAssets.ts ──
/**
 * Local image-asset processing shared by metadata storage: read pixel metrics,
 * compute perceptual hashes, dedupe visually identical covers, and drop flat
 * placeholder scans. Split out of `storage.ts` (was ~280 lines of self-contained
 * caches). All functions read from `public/` via a validated path and are
 * memoised; behaviour is unchanged from the previous in-file versions.
 */

export function hammingDistance(a: string, b: string): number {
  let count = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) count++;
  }
  return count + Math.abs(a.length - b.length);
}

// Au-delà de cette distance, deux images sont considérées distinctes. Les copies
// d'une même jaquette (tailles/encodages différents) tombent bien en dessous ;
// deux visuels réellement différents sont très au-dessus.
const PERCEPTUAL_DUPLICATE_MAX_DISTANCE = 8;

/**
 * Déduplique des images visuellement identiques même servies à des URLs, des
 * tailles ou des encodages différents (ex. la même boîte chez 5 boutiques).
 * On garde la première occurrence : l'appelant fournit la liste triée par
 * pertinence, donc la meilleure copie de chaque visuel est conservée.
 * Générique à tous les types de média.
 */
export function dedupeByPerceptualHash<
  T extends { type: AttachmentType; url: string },
>(
  attachments: T[],
  hashOf: (url: string) => string | null,
  maxDistance: number = PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
  // Lower = keep. When two images are visually identical, the one with the
  // smaller preference rank is kept as the representative (used to keep the most
  // valuable region instead of an arbitrary first-seen one).
  preferenceOf?: (item: T) => number,
  // When set, perceptual duplicates are only collapsed within the same group.
  // Metadata storage uses per-provider groups so gallery sources (Geedie,
  // LaunchBox, …) stay visible even when box art matches another provider.
  sameGroup?: (item: T) => string,
): T[] {
  const kept: Array<{ hash: string; resultIndex: number; group: string }> = [];
  const result: T[] = [];
  for (const attachment of attachments) {
    const hash = hashOf(attachment.url);
    if (hash === null) {
      result.push(attachment);
      continue;
    }
    const group = sameGroup?.(attachment) ?? "";
    const duplicate = kept.find(
      (entry) =>
        entry.group === group &&
        hammingDistance(entry.hash, hash) <= maxDistance,
    );
    if (duplicate) {
      if (
        preferenceOf &&
        preferenceOf(attachment) < preferenceOf(result[duplicate.resultIndex])
      ) {
        // Same visual, better region: swap it in (keeps its url + role) without
        // changing the slot's display order.
        result[duplicate.resultIndex] = attachment;
        duplicate.hash = hash;
      }
      continue;
    }
    kept.push({ hash, resultIndex: result.length, group });
    result.push(attachment);
  }
  return result;
}

const perceptualHashCache = new Map<string, Promise<string | null>>();

/**
 * Empreinte perceptuelle (dHash 64 bits, en chaîne binaire) d'un asset local :
 * niveaux de gris réduits en 9×8, chaque pixel comparé à son voisin de droite.
 * Mémoïsée.
 */
async function perceptualHashForAsset(url: string): Promise<string | null> {
  if (!url || !url.startsWith("/")) return null;
  const cached = perceptualHashCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const filePath = resolvePublicAssetPath(url);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const { data, info } = await sharp(filePath)
        .greyscale()
        .resize(9, 8, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const channels = info.channels;
      let hash = "";
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const left = data[(row * 9 + col) * channels];
          const right = data[(row * 9 + col + 1) * channels];
          hash += left < right ? "1" : "0";
        }
      }
      return hash;
    } catch {
      return null;
    }
  })();

  perceptualHashCache.set(url, task);
  if (perceptualHashCache.size > IMAGE_METRICS_CACHE_LIMIT) {
    const oldestKey = perceptualHashCache.keys().next().value;
    if (typeof oldestKey === "string") perceptualHashCache.delete(oldestKey);
  }
  return task;
}

export async function dedupeLocalizedAttachmentsByContent<
  T extends {
    type: AttachmentType;
    url: string;
    role?: string | null;
    source?: string | null;
  },
>(attachments: T[]): Promise<T[]> {
  const hashByUrl = new Map<string, string>();
  const metricsByUrl = new Map<string, AttachmentImageMetrics | null>();
  await Promise.all(
    attachments.map(async (attachment) => {
      if (!shouldReadImageMetricsForAttachment(attachment.type)) return;
      const hash = await perceptualHashForAsset(attachment.url);
      if (hash !== null) hashByUrl.set(attachment.url, hash);
      metricsByUrl.set(
        attachment.url,
        await readAttachmentImageMetrics(attachment.url),
      );
    }),
  );
  return dedupeByPerceptualHash(
    attachments,
    (url) => hashByUrl.get(url) ?? null,
    PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
    (item) => {
      const metrics = metricsByUrl.get(item.url) ?? null;
      const resolutionPenalty = isCoverResolutionAcceptable(metrics)
        ? 0
        : 1_000;
      return (
        resolutionPenalty +
        regionRank(
          resolveAttachmentDisplayRegion({ type: item.type, role: item.role }),
        )
      );
    },
    (item) => item.source ?? "merged",
  )
    .map((attachment) =>
      retargetUserHonorPinIfCatalogTwin(attachment, attachments, hashByUrl),
    )
    .filter((attachment, _index, gallery) =>
      keepSourcelessCoverOnlyWithoutCatalogTwin(
        attachment,
        gallery,
        hashByUrl,
      ),
    );
}

/**
 * Per-provider perceptual dedupe keeps a sourceless orphan beside its stamped
 * twin (groups differ: empty/"merged" vs a catalog provider id). Drop the orphan
 * so the picker shows the provider chip instead of a bare "JAQUETTE / Par défaut".
 */
export function keepSourcelessCoverOnlyWithoutCatalogTwin<
  T extends {
    type: AttachmentType;
    url: string;
    source?: string | null;
  },
>(
  attachment: T,
  gallery: readonly T[],
  hashByUrl: ReadonlyMap<string, string>,
  maxDistance: number = PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
): boolean {
  const sourceKey = attachmentSourceKey(attachment.source);
  if (sourceKey && sourceKey !== "merged") return true;
  if (!isCoverEligibleAttachmentType(attachment.type)) return true;

  const hash = hashByUrl.get(attachment.url) ?? null;
  return !gallery.some((other) => {
    if (other === attachment) return false;
    const otherKey = attachmentSourceKey(other.source);
    if (!otherKey || otherKey === "merged" || otherKey === "user") return false;
    if (!isCoverEligibleAttachmentType(other.type)) return false;
    if (urlsReferToSameLocalizedImage(other.url, attachment.url)) return true;
    if (!hash) return false;
    const otherHash = hashByUrl.get(other.url);
    if (!otherHash) return false;
    return hammingDistance(hash, otherHash) <= maxDistance;
  });
}

/** Re-hash local gallery rows and retarget `source: user` pins onto catalog twins. */
export async function retargetUserHonorPinsInAttachmentGallery<
  T extends {
    type: AttachmentType;
    url: string;
    source?: string | null;
  },
>(attachments: T[]): Promise<T[]> {
  if (!attachments.some((attachment) => attachmentSourceKey(attachment.source) === "user")) {
    return attachments;
  }
  const hashByUrl = new Map<string, string>();
  await Promise.all(
    attachments.map(async (attachment) => {
      if (!shouldReadImageMetricsForAttachment(attachment.type)) return;
      const hash = await perceptualHashForAsset(attachment.url);
      if (hash !== null) hashByUrl.set(attachment.url, hash);
    }),
  );
  return attachments.map((attachment) =>
    retargetUserHonorPinIfCatalogTwin(attachment, attachments, hashByUrl),
  );
}

function attachmentSourceKey(source?: string | null): string {
  return (source || "").split(/[·/]/)[0].toLowerCase().trim();
}

/**
 * Honor pins (`source: user`) often keep a client-localized UUID path while the
 * catalog row lands under a provider hash path — same art, two picker cards
 * ("Perso" + "Canal BD"). Retarget the pin onto the catalog URL so URL dedupe
 * keeps the provider badge.
 */
export function retargetUserHonorPinIfCatalogTwin<
  T extends {
    type: AttachmentType;
    url: string;
    source?: string | null;
  },
>(
  attachment: T,
  gallery: readonly T[],
  hashByUrl: ReadonlyMap<string, string>,
  maxDistance: number = PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
): T {
  if (attachmentSourceKey(attachment.source) !== "user") return attachment;
  const hash = hashByUrl.get(attachment.url);
  if (!hash) return attachment;

  let best: T | null = null;
  let bestDistance = maxDistance + 1;
  for (const other of gallery) {
    if (other === attachment) continue;
    if (attachmentSourceKey(other.source) === "user") continue;
    if (!isCoverEligibleAttachmentType(other.type)) continue;
    if (urlsReferToSameLocalizedImage(other.url, attachment.url)) {
      return { ...attachment, url: other.url };
    }
    const otherHash = hashByUrl.get(other.url);
    if (!otherHash) continue;
    const distance = hammingDistance(hash, otherHash);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }
  if (best && bestDistance <= maxDistance) {
    return { ...attachment, url: best.url };
  }
  return attachment;
}

const imageMetricsCache = new Map<
  string,
  Promise<AttachmentImageMetrics | null>
>();
const IMAGE_METRICS_CACHE_LIMIT = 1500;

export function shouldReadImageMetricsForAttachment(
  type: AttachmentType,
): boolean {
  return (
    type === "cover" ||
    type === "artwork" ||
    type === "image" ||
    type === "screenshot" ||
    type === "background"
  );
}

function resolvePublicAssetPath(url: string): string | null {
  if (!url || !url.startsWith("/")) return null;
  const cleanPath = url.split("?")[0]?.replace(/^\/+/, "");
  if (!cleanPath) return null;
  const safePath = cleanPath.replace(/\.\.(\/|\\)/g, "");
  return path.join(process.cwd(), "public", safePath);
}

export async function readAttachmentImageMetrics(
  url: string,
): Promise<AttachmentImageMetrics | null> {
  if (!url || !url.startsWith("/")) return null;
  const cached = imageMetricsCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const filePath = resolvePublicAssetPath(url);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const buffer = fs.readFileSync(filePath);
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) return null;
      const exposure = await measureCoverExposureFromBuffer(buffer);
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        meanLuminance: exposure?.meanLuminance,
        darkPixelRatio: exposure?.darkPixelRatio,
      };
    } catch {
      return null;
    }
  })();

  imageMetricsCache.set(url, task);
  if (imageMetricsCache.size > IMAGE_METRICS_CACHE_LIMIT) {
    const oldestKey = imageMetricsCache.keys().next().value;
    if (typeof oldestKey === "string") {
      imageMetricsCache.delete(oldestKey);
    }
  }
  return task;
}

const flatImageAssetCache = new Map<string, Promise<boolean>>();

async function isFlatImageAsset(url: string): Promise<boolean> {
  if (!url || !url.startsWith("/")) return false;
  const cached = flatImageAssetCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const filePath = resolvePublicAssetPath(url);
    if (!filePath || !fs.existsSync(filePath)) return false;
    try {
      const buffer = fs.readFileSync(filePath);
      if (await isUnavailableCoverPlaceholderBuffer(buffer)) {
        return true;
      }
      const stats = await sharp(buffer).stats();
      const metadata = await sharp(buffer).metadata();
      const exposure = await measureCoverExposureFromBuffer(buffer);
      const colorChannels = stats.channels.slice(0, 3);
      const maxColorStdev = Math.max(
        0,
        ...colorChannels.map((channel) => channel.stdev),
      );
      return isPlaceholderCoverImage({
        entropy: stats.entropy ?? 0,
        maxColorStdev,
        width: metadata.width,
        height: metadata.height,
        meanLuminance: exposure?.meanLuminance,
        darkPixelRatio: exposure?.darkPixelRatio,
      });
    } catch {
      return false;
    }
  })();

  flatImageAssetCache.set(url, task);
  if (flatImageAssetCache.size > IMAGE_METRICS_CACHE_LIMIT) {
    const oldestKey = flatImageAssetCache.keys().next().value;
    if (typeof oldestKey === "string") flatImageAssetCache.delete(oldestKey);
  }
  return task;
}

/**
 * Drop image-type attachments whose downloaded asset is a degenerate flat
 * placeholder. Non-image attachments (audio, etc.) pass through untouched.
 */
export async function filterOutFlatImageAttachments<
  T extends { type: AttachmentType; url: string },
>(attachments: T[]): Promise<T[]> {
  const flatChecks = await Promise.all(
    attachments.map(async (attachment) => ({
      url: attachment.url,
      flat:
        shouldReadImageMetricsForAttachment(attachment.type) &&
        (await isFlatImageAsset(attachment.url)),
    })),
  );
  const flatUrls = new Set(
    flatChecks.filter((check) => check.flat).map((check) => check.url),
  );
  return attachments.filter((attachment) => !flatUrls.has(attachment.url));
}

export {
  formatMetadataForStorage,
  formatMetadataFromStorage,
} from "@/core/enrich/dbMapping";
export {
  providerOriginalImageUrl,
  retailerOriginalImageUrl,
} from "@/core/enrich/imageUrls";
