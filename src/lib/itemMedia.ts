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
  pickBestCoverFromAttachments,
  rankAttachmentsForDisplay,
  scoreAttachmentForDisplay,
  type ScoredAttachmentInput,
} from "@/lib/attachmentDisplayScore";

export interface MediaItem {
  url: string;
  type: AttachmentType | string;
  source?: string | null;
  role?: string | null;
}

export interface MediaInput {
  imageUrl?: string | null;
  metadata?: {
    imageUrl?: string | null;
    sourceType?: string | null;
    attachments?: MediaItem[] | null;
  } | null;
  shelf?: {
    type?: string | null;
  } | null;
}

function isUserUploadedImage(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith("/") || url.startsWith("data:");
}

function attachments(item: MediaInput): ScoredAttachmentInput[] {
  return (item.metadata?.attachments ?? []) as ScoredAttachmentInput[];
}

function rankedAttachments(item: MediaInput): ScoredAttachmentInput[] {
  return rankAttachmentsForDisplay(attachments(item));
}

/**
 * Retourne l'URL de la jaquette affichée partout dans l'app.
 */
export function getCoverImage(item: MediaInput): string | null {
  if (isUserUploadedImage(item.imageUrl)) {
    return item.imageUrl || null;
  }

  if (item.metadata?.imageUrl) {
    return item.metadata.imageUrl;
  }

  const bestFromAttachments = pickBestCoverFromAttachments(attachments(item));
  if (bestFromAttachments) return bestFromAttachments;

  if (item.imageUrl) return item.imageUrl;

  return null;
}

export function getHeroImage(item: MediaInput): string | null {
  const ranked = rankedAttachments(item);
  const bg = ranked.find((attachment) => attachment.type === "background");
  if (bg) return bg.url;

  const artwork = ranked.find((attachment) => attachment.type === "artwork");
  if (artwork) return artwork.url;

  const screenshot = ranked.find((attachment) => attachment.type === "screenshot");
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
    add({ url: item.imageUrl, type: "image", source: "user" });
  }

  const ranked = rankedAttachments(item);
  const coverLike = ranked.filter((attachment) =>
    ["cover", "artwork", "image"].includes(attachment.type),
  );
  coverLike.forEach(add);

  if (item.metadata?.imageUrl) {
    add({ url: item.metadata.imageUrl, type: "cover" });
  }

  ranked
    .filter((attachment) => attachment.type === "screenshot")
    .forEach(add);
  ranked.filter((attachment) => attachment.type === "artwork").forEach(add);
  ranked.filter((attachment) => attachment.type === "background").forEach(add);
  ranked.filter((attachment) => attachment.type === "logo").forEach(add);
  ranked.filter((attachment) => attachment.type === "image").forEach(add);

  if (item.imageUrl && !seen.has(item.imageUrl)) {
    add({ url: item.imageUrl, type: "image" });
  }

  return max ? result.slice(0, max) : result;
}

export function getMediaTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cover: "Cover",
    screenshot: "Screenshot",
    artwork: "Artwork",
    background: "Background",
    logo: "Logo",
    image: "Image",
    video: "Video",
    audio: "Audio",
    book: "Book",
  };
  return labels[type] ?? type;
}

/** Score objectif d'un attachment (debug/admin, sans I/O). */
export function getAttachmentDisplayScore(attachment: ScoredAttachmentInput): number {
  return scoreAttachmentForDisplay(attachment);
}
