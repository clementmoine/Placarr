/**
 * Local image-asset processing: metrics, perceptual hash, dedupe, flat filters.
 */
import path from "path";
import fs from "fs";
import sharp from "sharp";
import type { AttachmentType } from "@prisma/client";
import {
  type AttachmentImageMetrics,
} from "@/core/enrich/media/attachmentDisplayScore";
import { isCoverResolutionAcceptable } from "@/core/enrich/media/imageMetrics";
import { isPlaceholderCoverImage } from "@/core/enrich/media/coverPlaceholder";
import { isUnavailableCoverPlaceholderBuffer } from "@/core/enrich/media/coverPlaceholder.server";
import { isCoverEligibleAttachmentType, urlsReferToSameLocalizedImage } from "@/core/enrich/media/coverUrl";
import { resolveAttachmentDisplayRegion } from "@/core/enrich/media/attachmentDisplayLabels";
import { measureCoverExposureFromBuffer } from "@/core/enrich/media/coverExposure.server";
import { regionRank } from "@/core/locale/preference";

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
export async function perceptualHashForAsset(
  url: string,
): Promise<string | null> {
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
