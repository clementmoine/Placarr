import crypto from "crypto";
import fs from "fs";
import path from "path";

import { prisma } from "@/lib/db/prisma";
import { runCpuBackgroundWork } from "@/core/collect/jobs/backgroundWorkQueue";
import {
  booknodeCanonicalCoverUrl,
  booknodeCoverMediaKey,
  booknodePreviewCoverUrl,
} from "./coverUrl";
import {
  isCoverResolutionAcceptable,
  readFileImageMetrics,
  shortestImageEdge,
} from "@/core/enrich/media/imageMetrics";
import { fetchRemoteImageBuffer } from "@/core/enrich/media/remoteFetch";
import { trimLightImageMargins } from "@/core/enrich/media/imageTrim";
import { isUnavailableCoverPlaceholderBuffer } from "@/core/enrich/media/coverPlaceholder.server";
import { urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import { remoteImageProxyProviderFor } from "@/core/enrich/media/remoteProxy";
import { getProviderModule } from "@/core/catalog/catalog";
import { uploadsDir as runtimeUploadsDir } from "@/lib/runtimeData";

const BOOKNODE_CDN_HOST = "cdn1.booknode.com/book_cover/";
const LOCAL_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export function isBooknodeCoverUrl(url?: string | null): boolean {
  return Boolean(url?.includes(BOOKNODE_CDN_HOST));
}

function uploadHashForBooknode(url: string): string {
  const mediaKey = booknodeCoverMediaKey(url);
  const seed = mediaKey ? `booknode:${mediaKey}` : url;
  return crypto.createHash("md5").update(seed).digest("hex");
}

function uploadsDir(): string {
  const targetDir = runtimeUploadsDir();
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

async function existingBooknodeLocalizedUpload(
  url: string,
): Promise<string | null> {
  const hash = uploadHashForBooknode(url);
  const targetDir = uploadsDir();

  for (const ext of LOCAL_IMAGE_EXTENSIONS) {
    const targetPath = path.join(targetDir, `${hash}${ext}`);
    if (!fs.existsSync(targetPath)) continue;
    const metrics = await readFileImageMetrics(targetPath);
    if (shortestImageEdge(metrics) > 0) {
      return `/uploads/${hash}${ext}`;
    }
  }

  return null;
}

async function writeLocalizedBooknodeBuffer(
  buffer: Buffer,
  sourceUrl: string,
  ext: string,
): Promise<string | null> {
  if (await isUnavailableCoverPlaceholderBuffer(buffer)) return null;

  const hash = uploadHashForBooknode(sourceUrl);
  const normalizedExt = ext.toLowerCase().startsWith(".") ? ext : `.${ext}`;
  const filename = `${hash}${normalizedExt}`;
  const targetPath = path.join(uploadsDir(), filename);

  for (const otherExt of LOCAL_IMAGE_EXTENSIONS) {
    if (otherExt === normalizedExt) continue;
    const sibling = path.join(uploadsDir(), `${hash}${otherExt}`);
    if (fs.existsSync(sibling)) {
      fs.unlinkSync(sibling);
    }
  }

  fs.writeFileSync(targetPath, buffer);
  return `/uploads/${filename}`;
}

async function persistBooknodeFetch(
  fetchUrl: string,
  sourceUrl: string,
  options: { allowSubThresholdFallback?: boolean; trim?: boolean },
): Promise<string | null> {
  const fetched = await fetchRemoteImageBuffer(fetchUrl, {
    allowSubThresholdFallback: options.allowSubThresholdFallback,
  });
  if (!fetched) return null;

  let buffer = fetched.buffer;
  if (options.trim) {
    buffer = await trimLightImageMargins(buffer, { minMarginPixels: 30 });
  }

  const ext = path.extname(new URL(fetched.sourceUrl).pathname) || ".jpg";
  return writeLocalizedBooknodeBuffer(buffer, sourceUrl, ext);
}

export type BooknodeCoverDownloadContext = {
  source?: string | null;
  itemId?: string;
  metadataId?: string;
  trim?: boolean;
};

export function scheduleBooknodeCoverUpgrade(
  sourceUrl: string,
  context: BooknodeCoverDownloadContext,
): void {
  if (!context.itemId) return;
  const canonical = booknodeCanonicalCoverUrl(sourceUrl);
  const preview = booknodePreviewCoverUrl(sourceUrl);
  if (!canonical || canonical === preview) return;

  void runCpuBackgroundWork(async () => {
    try {
      await upgradeBooknodeCoverToCanonical(sourceUrl, context);
    } catch (error) {
      console.error(
        `[BooknodeCover] Upgrade failed for ${sourceUrl}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}

async function upgradeBooknodeCoverToCanonical(
  sourceUrl: string,
  context: BooknodeCoverDownloadContext,
): Promise<void> {
  const canonical = booknodeCanonicalCoverUrl(sourceUrl);
  if (!canonical) return;

  const existing = await existingBooknodeLocalizedUpload(sourceUrl);
  const existingMetrics = existing
    ? await readFileImageMetrics(path.join(process.cwd(), "public", existing))
    : null;
  if (
    existing &&
    isCoverResolutionAcceptable(existingMetrics) &&
    !existing.endsWith(".webp")
  ) {
    return;
  }

  const upgraded = await persistBooknodeFetch(canonical, sourceUrl, {
    allowSubThresholdFallback: false,
    trim: context.trim,
  });
  if (!upgraded) return;

  const upgradedMetrics = await readFileImageMetrics(
    path.join(process.cwd(), "public", upgraded),
  );
  if (!isCoverResolutionAcceptable(upgradedMetrics)) return;

  await applyBooknodeLocalizedCoverUpgrade(
    context.itemId!,
    sourceUrl,
    upgraded,
    context.metadataId,
  );
}

async function applyBooknodeLocalizedCoverUpgrade(
  itemId: string,
  sourceUrl: string,
  localizedUrl: string,
  metadataId?: string,
): Promise<void> {
  const mediaKey = booknodeCoverMediaKey(sourceUrl);
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      imageUrl: true,
      metadata: {
        select: {
          id: true,
          imageUrl: true,
          attachments: {
            select: { id: true, url: true, source: true },
          },
        },
      },
    },
  });

  const metadata = item?.metadata;
  if (!metadata) return;
  if (metadataId && metadata.id !== metadataId) return;

  const matchesBooknodeCover = (url?: string | null) => {
    if (!url || !isBooknodeCoverUrl(url)) return false;
    if (!mediaKey) {
      return urlsReferToSameLocalizedImage(url, sourceUrl);
    }
    return booknodeCoverMediaKey(url) === mediaKey;
  };

  for (const attachment of metadata.attachments) {
    if (matchesBooknodeCover(attachment.url)) {
      await prisma.attachment.update({
        where: { id: attachment.id },
        data: { url: localizedUrl },
      });
    }
  }

  if (matchesBooknodeCover(metadata.imageUrl)) {
    await prisma.metadata.update({
      where: { id: metadata.id },
      data: { imageUrl: localizedUrl },
    });
  }

  if (
    item.imageUrl &&
    (matchesBooknodeCover(item.imageUrl) ||
      urlsReferToSameLocalizedImage(item.imageUrl, metadata.imageUrl || ""))
  ) {
    await prisma.item.update({
      where: { id: itemId },
      data: { imageUrl: localizedUrl },
    });
  }
}

/**
 * Fast Booknode localization: persist the preview (/mod11/) first, then upgrade
 * to /full/ JPEG asynchronously without blocking the metadata pipeline.
 */
export async function downloadBooknodeCoverImage(
  url: string,
  context: BooknodeCoverDownloadContext = {},
): Promise<string | null> {
  const existing = await existingBooknodeLocalizedUpload(url);
  if (existing) {
    scheduleBooknodeCoverUpgrade(url, context);
    return existing;
  }

  const previewUrl = booknodePreviewCoverUrl(url) ?? url;
  const fastLocalized = await persistBooknodeFetch(previewUrl, url, {
    allowSubThresholdFallback: true,
    trim: context.trim,
  });

  if (fastLocalized) {
    scheduleBooknodeCoverUpgrade(url, context);
    return fastLocalized;
  }

  const canonical = booknodeCanonicalCoverUrl(url);
  if (canonical && canonical !== previewUrl) {
    const fullLocalized = await persistBooknodeFetch(canonical, url, {
      allowSubThresholdFallback: false,
      trim: context.trim,
    });
    if (fullLocalized) return fullLocalized;
  }

  return canKeepRemoteBooknodeFallback(url, context.source) ? url : null;
}

function canKeepRemoteBooknodeFallback(
  url: string,
  source?: string | null,
): boolean {
  const provider = remoteImageProxyProviderFor(url);
  if (!provider?.remoteImageFallback) return false;
  if (source) {
    const providerModule = getProviderModule(source);
    if (providerModule?.info.remoteImageFallback) return true;
  }
  return isBooknodeCoverUrl(url);
}
