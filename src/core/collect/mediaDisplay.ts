/**
 * Client-light hero / gallery for item detail — no attachment scoring stack.
 *
 * Full `getHeroImage` / `getGalleryImages` in `media.ts` pull platform lists,
 * locale JSON, and display scoring (~500 KB). Enriched items already carry
 * `heroImageUrl` + stamped attachments; that is enough for the detail page.
 */
import type { AttachmentType } from "@/generated/prisma/browser";

export type MediaDisplayItem = {
  url: string;
  type: AttachmentType | string;
  source?: string | null;
  role?: string | null;
  title?: string | null;
  providerLabel?: string | null;
  sourceNames?: string[] | null;
  gridStyleCoverLabelsSource?: boolean | null;
};

type MediaDisplayInput = {
  imageUrl?: string | null;
  metadata?: {
    heroImageUrl?: string | null;
    imageUrl?: string | null;
    attachments?: Array<{
      url?: string | null;
      type?: string | null;
      source?: string | null;
      role?: string | null;
      title?: string | null;
      providerLabel?: string | null;
      sourceNames?: string[] | null;
      gridStyleCoverLabelsSource?: boolean | null;
    }> | null;
  } | null;
};

const GALLERY_TYPES = new Set([
  "cover",
  "screenshot",
  "artwork",
  "background",
  "logo",
  "image",
]);

export function getHeroImageLight(item: MediaDisplayInput): string | null {
  if (item.metadata?.heroImageUrl?.trim()) {
    return item.metadata.heroImageUrl.trim();
  }
  return item.imageUrl?.trim() || item.metadata?.imageUrl?.trim() || null;
}

export function getGalleryImagesLight(
  item: MediaDisplayInput,
  max?: number,
): MediaDisplayItem[] {
  const seen = new Set<string>();
  const result: MediaDisplayItem[] = [];

  const add = (media: MediaDisplayItem) => {
    const url = media.url?.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push({ ...media, url });
  };

  if (item.imageUrl?.trim()) {
    add({ url: item.imageUrl.trim(), type: "cover" });
  }

  for (const attachment of item.metadata?.attachments ?? []) {
    const url = attachment.url?.trim();
    const type = (attachment.type ?? "").trim();
    if (!url || !GALLERY_TYPES.has(type)) continue;
    add({
      url,
      type,
      source: attachment.source,
      role: attachment.role,
      title: attachment.title,
      providerLabel: attachment.providerLabel,
      sourceNames: attachment.sourceNames,
      gridStyleCoverLabelsSource: attachment.gridStyleCoverLabelsSource,
    });
    if (max != null && result.length >= max) return result;
  }

  return max != null ? result.slice(0, max) : result;
}
