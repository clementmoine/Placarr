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
  title?: string | null;
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
 * item.imageUrl = choix explicite utilisateur (upload ou galerie).
 * metadata.imageUrl = défaut calculé à l'enrichissement.
 */
export function getCoverImage(item: MediaInput): string | null {
  if (item.imageUrl) {
    return item.imageUrl;
  }

  if (item.metadata?.imageUrl) {
    return item.metadata.imageUrl;
  }

  const bestFromAttachments = pickBestCoverFromAttachments(attachments(item));
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

export { getMediaTypeLabel } from "@/lib/attachmentDisplayLabels";

/** Score objectif d'un attachment (debug/admin, sans I/O). */
export function getAttachmentDisplayScore(
  attachment: ScoredAttachmentInput,
): number {
  return scoreAttachmentForDisplay(attachment);
}
