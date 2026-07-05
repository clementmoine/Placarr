import { AttachmentType } from "@prisma/client";
import fs from "fs";
import path from "path";
import sharp from "sharp";

import { type AttachmentImageMetrics } from "@/core/media/attachmentDisplayScore";
import { isCoverResolutionAcceptable } from "@/core/media/imageMetrics";
import { resolveAttachmentDisplayRegion } from "@/core/media/attachmentDisplayLabels";
import { measureCoverExposureFromBuffer } from "@/core/media/coverExposure.server";
import { isPlaceholderCoverImage } from "@/core/media/coverPlaceholder";
import { isUnavailableCoverPlaceholderBuffer } from "@/core/media/coverPlaceholder.server";
import { regionRank } from "@/core/locale/preference";

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
  );
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
