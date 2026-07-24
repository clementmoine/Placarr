/**
 * Remote cover acquisition: localize a remote image URL into `public/uploads`.
 */
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { PROVIDERS, providerModuleForCoverDownload } from "@/core/catalog/catalog";
import { canonicalProviderIdForSource } from "@/core/catalog/sourceTraits";
import { isMissingArtImageUrl } from "@/core/enrich/media/coverPlaceholder";
import { isUnavailableCoverPlaceholderBuffer } from "@/core/enrich/media/coverPlaceholder.server";
import { trimLightImageMargins } from "@/core/enrich/media/imageTrim";
import { coverDownloadCandidates } from "@/core/enrich/media/coverDownloadCandidates";
import { fetchRemoteImageBuffer } from "@/core/enrich/media/remoteFetch";
import { providerOriginalImageUrl } from "@/core/enrich/imageUrls";

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
        source: options.source ?? undefined,
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

