/**
 * Persist cropped covers into the attachment gallery without inventing Perso twins.
 */
import { prisma } from "@/lib/db/prisma";
import {
  urlsReferToSameLocalizedImage,
  isCoverEligibleAttachmentType,
} from "@/core/enrich/media/coverUrl";
import {
  hammingDistance,
  perceptualHashForAsset,
  PERCEPTUAL_DUPLICATE_MAX_DISTANCE,
  retargetUserHonorPinsInAttachmentGallery,
} from "@/core/enrich/media/imageAssets";
import { inferProviderIdFromMediaUrl } from "@/core/catalog/sourceTraits";

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
